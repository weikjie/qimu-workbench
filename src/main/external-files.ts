import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { copyFile, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path'
import type {
  ExternalFileFlushInput,
  ExternalFileOpenRequest,
  ExternalFileSaveResult,
  ExternalMarkdownDocument
} from '../shared/types'

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])
const MAX_EXTERNAL_FILE_BYTES = 8 * 1024 * 1024
const MAX_EXTERNAL_CONTENT_CHARS = 2_000_000
const MAX_OPEN_DOCUMENTS = 50
const MAX_ASSET_BYTES = 32 * 1024 * 1024
const ASSET_CONTENT_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.avif', 'image/avif'],
  ['.bmp', 'image/bmp'],
  ['.ico', 'image/x-icon']
])

interface OpenDocument {
  id: string
  path: string
  pathKey: string
  name: string
}

const openDocuments = new Map<string, OpenDocument>()
const pathKeys = new Map<string, string>()
const pendingOpenRequests: ExternalFileOpenRequest[] = []
const saveQueues = new Map<string, Promise<void>>()

function pathKey(filePath: string): string {
  return process.platform === 'win32' ? filePath.toLowerCase() : filePath
}

function isMarkdownPath(filePath: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extname(filePath).toLowerCase())
}

function cleanArgument(value: string): string {
  const trimmed = value.trim()
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * Electron gives us both the executable and Chromium switches on launch.
 * Keep only plausible Markdown paths so flags such as --inspect never reach
 * the file reader.
 */
export function extractMarkdownPaths(args: readonly string[], workingDirectory: string): string[] {
  const paths: string[] = []
  const seen = new Set<string>()

  for (const argument of args) {
    const candidate = cleanArgument(argument)
    if (!candidate || candidate.startsWith('-') || !isMarkdownPath(candidate)) continue
    const absolute = resolve(workingDirectory, candidate)
    const key = pathKey(absolute)
    if (seen.has(key)) continue
    seen.add(key)
    paths.push(absolute)
  }

  return paths
}

function openErrorMessage(error: unknown, fileName: string): string {
  const code = (error as NodeJS.ErrnoException).code
  if (code === 'ENOENT') return `无法打开「${fileName}」：文件不存在或已被移动。`
  if (code === 'EACCES' || code === 'EPERM') return `无法打开「${fileName}」：没有读取权限。`
  if (code === 'EISDIR') return `无法打开「${fileName}」：这不是一个文件。`
  return `无法打开「${fileName}」：读取文件失败。`
}

/** Reads a Markdown file and queues it for the renderer, reusing an ID when
 * the same path is already open. */
export async function queueExternalMarkdown(filePath: string): Promise<void> {
  const absolute = resolve(filePath)
  const fileName = basename(absolute)

  if (!isMarkdownPath(absolute)) {
    pendingOpenRequests.push({ ok: false, message: `无法打开「${fileName}」：不是 Markdown 文件。` })
    return
  }

  try {
    const info = await stat(absolute)
    if (!info.isFile()) {
      pendingOpenRequests.push({ ok: false, message: `无法打开「${fileName}」：这不是一个文件。` })
      return
    }
    if (info.size > MAX_EXTERNAL_FILE_BYTES) {
      pendingOpenRequests.push({ ok: false, message: `无法打开「${fileName}」：文件超过 8 MB。` })
      return
    }

    const raw = await readFile(absolute, 'utf8')
    if (raw.length > MAX_EXTERNAL_CONTENT_CHARS) {
      pendingOpenRequests.push({ ok: false, message: `无法打开「${fileName}」：内容超过 200 万字。` })
      return
    }

    const key = pathKey(absolute)
    let id = pathKeys.get(key)
    if (!id) {
      if (openDocuments.size >= MAX_OPEN_DOCUMENTS) {
        pendingOpenRequests.push({ ok: false, message: '同时打开的文件过多，请先关闭一些文件。' })
        return
      }
      id = randomUUID()
      pathKeys.set(key, id)
    }

    openDocuments.set(id, { id, path: absolute, pathKey: key, name: fileName })
    const document: ExternalMarkdownDocument = {
      id,
      name: fileName,
      path: absolute,
      content: raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw,
      modifiedAt: info.mtime.toISOString()
    }
    pendingOpenRequests.push({ ok: true, document })
  } catch (error) {
    console.warn('[workbench] could not open markdown file:', error)
    pendingOpenRequests.push({ ok: false, message: openErrorMessage(error, fileName) })
  }
}

export function takeExternalOpenRequests(): ExternalFileOpenRequest[] {
  return pendingOpenRequests.splice(0, pendingOpenRequests.length)
}

export function closeExternalDocument(id: string): void {
  const document = openDocuments.get(id)
  if (!document) return
  openDocuments.delete(id)
  pathKeys.delete(document.pathKey)
  saveQueues.delete(id)
}

export interface ExternalAsset {
  data: Uint8Array
  contentType: string
}

/**
 * Resolves an image relative to an already-open Markdown file. Only image
 * files are served, and every request must reference a live document ID from
 * this process, so the renderer cannot use the protocol as a generic file
 * reader.
 */
export async function readExternalAsset(
  documentId: string,
  source: string
): Promise<ExternalAsset | null> {
  const document = openDocuments.get(documentId)
  if (!document) return null

  const withoutQuery = source.split(/[?#]/, 1)[0] ?? ''
  let relativePath: string
  try {
    relativePath = decodeURIComponent(withoutQuery).replace(/\\/g, '/')
  } catch {
    return null
  }
  if (!relativePath || isAbsolute(relativePath) || /^[a-z]:/i.test(relativePath)) return null

  const filePath = resolve(dirname(document.path), relativePath)
  const ext = extname(filePath).toLowerCase()
  const contentType = ASSET_CONTENT_TYPES.get(ext)
  if (!contentType) return null

  try {
    const info = await stat(filePath)
    if (!info.isFile() || info.size > MAX_ASSET_BYTES) return null
    const data = await readFile(filePath)
    return { data: new Uint8Array(data), contentType }
  } catch (error) {
    console.warn('[workbench] could not read markdown image:', error)
    return null
  }
}

async function writeDocument(filePath: string, content: string): Promise<void> {
  const temp = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temp, content, 'utf8')
  try {
    await rename(temp, filePath)
  } catch {
    // Antivirus or Explorer preview can briefly lock the destination.
    await copyFile(temp, filePath)
    await unlink(temp).catch(() => undefined)
  }
}

export async function saveExternalDocument(
  id: string,
  content: string
): Promise<ExternalFileSaveResult> {
  const document = openDocuments.get(id)
  if (!document) {
    return { ok: false, message: '这个文件已经关闭，请重新打开后再保存。' }
  }
  if (content.length > MAX_EXTERNAL_CONTENT_CHARS) {
    return { ok: false, message: '内容超过 200 万字，暂时无法保存。' }
  }

  const previous = saveQueues.get(id) ?? Promise.resolve()
  const write = previous
    .catch(() => undefined)
    .then(() => writeDocument(document.path, content))
    .catch((error) => {
      console.error('[workbench] markdown save failed:', error)
      throw error
    })
  saveQueues.set(
    id,
    write.then(
      () => undefined,
      () => undefined
    )
  )

  try {
    await write
    const info = await stat(document.path)
    return { ok: true, modifiedAt: info.mtime.toISOString() }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'EPERM') {
      return { ok: false, message: `无法保存「${document.name}」：没有写入权限。` }
    }
    return { ok: false, message: `无法保存「${document.name}」：文件可能被其他程序占用。` }
  }
}

function writeDocumentSync(filePath: string, content: string): void {
  const temp = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(temp, content, 'utf8')
  try {
    renameSync(temp, filePath)
  } catch {
    // Fall back to a direct copy so the latest text still lands on disk.
    copyFileSync(temp, filePath)
    try {
      unlinkSync(temp)
    } catch {
      // The temp file can be cleaned up by the OS later.
    }
  }
}

/** Best-effort synchronous write used from the pagehide path. */
export function flushExternalDocumentsSync(inputs: readonly ExternalFileFlushInput[]): void {
  for (const input of inputs) {
    const document = openDocuments.get(input.id)
    if (!document || typeof input.content !== 'string') continue
    if (input.content.length > MAX_EXTERNAL_CONTENT_CHARS) continue
    try {
      writeDocumentSync(document.path, input.content)
    } catch (error) {
      console.error('[workbench] synchronous markdown flush failed:', error)
    }
  }
}
