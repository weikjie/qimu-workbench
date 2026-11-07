import { randomUUID } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'

export const MAX_IMAGE_BYTES = 32 * 1024 * 1024

export const IMAGE_CONTENT_TYPES = new Map([
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

export interface ImageAsset {
  data: Uint8Array
  contentType: string
}

interface ImageFormat {
  extension: string
  contentType: string
  matches: (data: Uint8Array) => boolean
}

function startsWithAscii(data: Uint8Array, offset: number, value: string): boolean {
  if (data.length < offset + value.length) return false
  for (let index = 0; index < value.length; index += 1) {
    if (data[offset + index] !== value.charCodeAt(index)) return false
  }
  return true
}

// Clipboard images always arrive as real files, so the signature is a more
// reliable format hint than the MIME type reported by the operating system.
const IMAGE_FORMATS: readonly ImageFormat[] = [
  {
    extension: '.png',
    contentType: 'image/png',
    matches: (data) =>
      startsWithAscii(data, 1, 'PNG') &&
      data.length >= 8 &&
      data[0] === 0x89 &&
      data[4] === 0x0d &&
      data[5] === 0x0a &&
      data[6] === 0x1a &&
      data[7] === 0x0a
  },
  {
    extension: '.jpg',
    contentType: 'image/jpeg',
    matches: (data) => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
  },
  {
    extension: '.gif',
    contentType: 'image/gif',
    matches: (data) => startsWithAscii(data, 0, 'GIF87a') || startsWithAscii(data, 0, 'GIF89a')
  },
  {
    extension: '.webp',
    contentType: 'image/webp',
    matches: (data) => startsWithAscii(data, 0, 'RIFF') && startsWithAscii(data, 8, 'WEBP')
  },
  {
    extension: '.avif',
    contentType: 'image/avif',
    matches: (data) =>
      startsWithAscii(data, 4, 'ftyp') &&
      (startsWithAscii(data, 8, 'avif') || startsWithAscii(data, 8, 'avis'))
  },
  {
    extension: '.bmp',
    contentType: 'image/bmp',
    matches: (data) => startsWithAscii(data, 0, 'BM')
  },
  {
    extension: '.ico',
    contentType: 'image/x-icon',
    matches: (data) => data.length >= 4 && data[0] === 0 && data[1] === 0 && data[2] === 1 && data[3] === 0
  }
]

export interface StoredImage {
  fileName: string
  contentType: string
}

export type StoreImageResult =
  | { ok: true; image: StoredImage }
  | { ok: false; message: string }

function decodeSource(source: string): string | null {
  const withoutQuery = source.split(/[?#]/, 1)[0] ?? ''
  try {
    const decoded = decodeURIComponent(withoutQuery).replace(/\\/g, '/')
    return decoded || null
  } catch {
    return null
  }
}

/**
 * Reads an image that the renderer referenced by a path relative to a
 * Markdown file. With `restrictToBase`, the resolved path must stay inside
 * the base directory (used for app-owned note images).
 */
export async function readImageAsset(
  baseDirectory: string,
  source: string,
  restrictToBase = false
): Promise<ImageAsset | null> {
  const relativePath = decodeSource(source)
  if (!relativePath || relativePath.includes('\u0000')) return null
  if (isAbsolute(relativePath) || /^[a-z]:/i.test(relativePath)) return null

  const filePath = resolve(baseDirectory, relativePath)
  if (restrictToBase) {
    const inside = relative(baseDirectory, filePath)
    if (!inside || inside.startsWith('..') || isAbsolute(inside)) return null
  }

  const contentType = IMAGE_CONTENT_TYPES.get(extname(filePath).toLowerCase())
  if (!contentType) return null

  try {
    const info = await stat(filePath)
    if (!info.isFile() || info.size > MAX_IMAGE_BYTES) return null
    const data = await readFile(filePath)
    return { data: new Uint8Array(data), contentType }
  } catch (error) {
    console.warn('[workbench] could not read markdown image:', error)
    return null
  }
}

function timestamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

/** Writes a pasted image into its note directory and returns its file name. */
export async function storePastedImage(
  directory: string,
  data: Uint8Array
): Promise<StoreImageResult> {
  if (data.byteLength === 0) {
    return { ok: false, message: '剪贴板里的图片是空的。' }
  }
  if (data.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, message: '图片超过 32 MB，暂时无法保存。' }
  }

  const format = IMAGE_FORMATS.find((candidate) => candidate.matches(data))
  if (!format) {
    return { ok: false, message: '暂不支持剪贴板里的这种图片格式。' }
  }

  try {
    await mkdir(directory, { recursive: true })
    const fileName = `image-${timestamp()}-${randomUUID().replace(/-/g, '').slice(0, 8)}${format.extension}`
    await writeFile(join(directory, fileName), data)
    return { ok: true, image: { fileName, contentType: format.contentType } }
  } catch (error) {
    console.error('[workbench] could not write pasted image:', error)
    return { ok: false, message: '图片写入失败，请检查笔记文件夹的写入权限。' }
  }
}
