import { readdirSync, unlinkSync } from 'node:fs'
import { readdir, unlink } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { IMAGE_CONTENT_TYPES } from './image-files'

/** A pasted image exists on disk before its Markdown reference reaches the
 * note body, so keep freshly written images around for a short while. A note
 * save can happen between those two steps. */
const PENDING_IMAGE_TTL_MS = 60 * 1000

const pendingImages = new Map<string, number>()

/** Answers whether any note body still mentions an image file name. */
export type NoteImageReferenceLookup = (fileName: string) => boolean

function pathKey(filePath: string): string {
  return process.platform === 'win32' ? filePath.toLowerCase() : filePath
}

/**
 * Collected note bodies are matched in lowercase because Windows file names are
 * case-insensitive. URL-encoded spellings cover references such as
 * `img/note/my%20image.png`.
 */
function referenceVariants(fileName: string): string[] {
  const variants = new Set([fileName.toLowerCase()])
  for (const encode of [encodeURI, encodeURIComponent]) {
    try {
      variants.add(encode(fileName).toLowerCase())
    } catch {
      // A lone surrogate cannot be URL-encoded; the raw name is enough.
    }
  }
  return [...variants]
}

export function createNoteImageReferenceLookup(
  contents: Iterable<string>
): NoteImageReferenceLookup {
  const haystacks = Array.from(contents, (content) => content.toLowerCase())
  return (fileName) => {
    const variants = referenceVariants(fileName)
    return haystacks.some((haystack) => variants.some((variant) => haystack.includes(variant)))
  }
}

/** Remembers an image that was just written, until a saved note references it. */
export function trackPendingNoteImage(directory: string, fileName: string): void {
  pendingImages.set(pathKey(join(directory, fileName)), Date.now())
}

interface ImageDirectoryEntry {
  name: string
  isFile(): boolean
}

function unusedImageNames(
  directory: string,
  entries: readonly ImageDirectoryEntry[],
  isReferenced: NoteImageReferenceLookup,
  now: number
): string[] {
  const names: string[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!IMAGE_CONTENT_TYPES.has(extname(entry.name).toLowerCase())) continue

    const key = pathKey(join(directory, entry.name))
    if (isReferenced(entry.name)) {
      // Once the reference is persisted the image no longer needs protection.
      pendingImages.delete(key)
      continue
    }

    const pendingSince = pendingImages.get(key)
    if (pendingSince !== undefined && now - pendingSince < PENDING_IMAGE_TTL_MS) continue
    names.push(entry.name)
  }

  return names
}

/**
 * Deletes images inside one app-owned note image directory that none of the
 * note bodies reference any more. Only image files are touched: other files in
 * the directory, and the directory itself, are left alone.
 */
export async function pruneUnusedNoteImages(
  directory: string,
  isReferenced: NoteImageReferenceLookup
): Promise<void> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[workbench] could not read note image folder:', error)
    }
    return
  }

  for (const fileName of unusedImageNames(directory, entries, isReferenced, Date.now())) {
    const filePath = join(directory, fileName)
    try {
      await unlink(filePath)
      pendingImages.delete(pathKey(filePath))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[workbench] could not remove unused note image:', error)
      }
    }
  }
}

/** Synchronous variant used when the window is closing. */
export function pruneUnusedNoteImagesSync(
  directory: string,
  isReferenced: NoteImageReferenceLookup
): void {
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[workbench] could not read note image folder:', error)
    }
    return
  }

  for (const fileName of unusedImageNames(directory, entries, isReferenced, Date.now())) {
    const filePath = join(directory, fileName)
    try {
      unlinkSync(filePath)
      pendingImages.delete(pathKey(filePath))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[workbench] could not remove unused note image:', error)
      }
    }
  }
}
