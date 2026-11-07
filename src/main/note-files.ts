import { randomUUID } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { getAppDataPaths } from './data-paths'

export const NOTE_FILE_EXTENSION = '.md'
export const MAX_NOTE_CHARS = 2_000_000
const MAX_STEM_CHARS = 80
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i

export interface NoteFileInfo {
  file: string
  content: string
  createdAt: string
  updatedAt: string
}

export function ensureNotesDirectory(): string {
  const directory = getAppDataPaths().notesDir
  mkdirSync(directory, { recursive: true })
  return directory
}

export function noteFilePath(fileName: string): string {
  return join(getAppDataPaths().notesDir, fileName)
}

export function sanitizeStoredNoteFileName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const candidate = value.trim()
  if (!candidate || candidate !== basename(candidate)) return null
  if (candidate.startsWith('.')) return null
  if (candidate.length > 240) return null
  if (extname(candidate).toLowerCase() !== NOTE_FILE_EXTENSION) return null
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(candidate)) return null
  return candidate
}

export function noteFileStem(fileName: string): string {
  return basename(fileName, extname(fileName))
}

export function titleToFileStem(title: string): string {
  let stem = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim()

  if (!stem) stem = '无标题笔记'
  if (RESERVED_WINDOWS_NAMES.test(stem)) stem = `_${stem}`
  if (Array.from(stem).length > MAX_STEM_CHARS) {
    stem = Array.from(stem).slice(0, MAX_STEM_CHARS).join('').trim()
  }
  return stem || '无标题笔记'
}

/** Reserved names are stored lowercase so Windows case-insensitivity cannot
 * create files that silently overwrite each other. */
export function fileKey(fileName: string): string {
  return process.platform === 'win32' ? fileName.toLowerCase() : fileName
}

export function uniqueNoteFileName(stem: string, reserved: ReadonlySet<string>): string {
  const directory = ensureNotesDirectory()
  let suffix = 1
  while (true) {
    const candidate = `${stem}${suffix === 1 ? '' : ` (${suffix})`}${NOTE_FILE_EXTENSION}`
    if (!reserved.has(fileKey(candidate)) && !existsSync(join(directory, candidate))) {
      return candidate
    }
    suffix += 1
  }
}

function decodeContent(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
}

export async function readNoteFile(fileName: string): Promise<NoteFileInfo | null> {
  try {
    const path = noteFilePath(fileName)
    const info = await stat(path)
    if (!info.isFile()) return null
    const content = decodeContent(await readFile(path, 'utf8'))
    if (content.length > MAX_NOTE_CHARS) return null
    return {
      file: fileName,
      content,
      createdAt: info.birthtimeMs > 0 ? new Date(info.birthtimeMs).toISOString() : info.mtime.toISOString(),
      updatedAt: info.mtime.toISOString()
    }
  } catch (error) {
    console.warn('[workbench] could not read note file:', error)
    return null
  }
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const temp = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temp, content, 'utf8')
  try {
    await rename(temp, filePath)
  } catch {
    await copyFile(temp, filePath)
    await unlink(temp).catch(() => undefined)
  }
}

export async function writeNoteFile(fileName: string, content: string): Promise<void> {
  const directory = ensureNotesDirectory()
  await mkdir(directory, { recursive: true })
  await writeAtomic(noteFilePath(fileName), content)
}

export async function removeNoteFile(fileName: string): Promise<void> {
  try {
    await unlink(noteFilePath(fileName))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

export async function listNoteFiles(): Promise<NoteFileInfo[]> {
  const directory = ensureNotesDirectory()
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    console.warn('[workbench] could not read notes directory:', error)
    return []
  }

  const files: NoteFileInfo[] = []
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue
    if (extname(entry.name).toLowerCase() !== NOTE_FILE_EXTENSION) continue
    const note = await readNoteFile(entry.name)
    if (note) files.push(note)
  }
  return files
}

function writeAtomicSync(filePath: string, content: string): void {
  const temp = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(temp, content, 'utf8')
  try {
    renameSync(temp, filePath)
  } catch {
    copyFileSync(temp, filePath)
    try {
      unlinkSync(temp)
    } catch {
      // The temp file can be cleaned up by the OS later.
    }
  }
}

export function writeNoteFileSync(fileName: string, content: string): void {
  const directory = ensureNotesDirectory()
  mkdirSync(directory, { recursive: true })
  writeAtomicSync(noteFilePath(fileName), content)
}

export function removeNoteFileSync(fileName: string): void {
  try {
    unlinkSync(noteFilePath(fileName))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

export function noteFileExists(fileName: string): boolean {
  try {
    return statSync(noteFilePath(fileName)).isFile()
  } catch {
    return false
  }
}

