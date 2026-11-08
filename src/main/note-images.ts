import { getAppDataPaths } from './data-paths'
import { readImageAsset, storePastedImage, type ImageAsset } from './image-files'
import { trackPendingNoteImage } from './note-image-cleanup'
import { noteFileStem, noteImageDirectory } from './note-files'
import { trackedNoteFile } from './store'
import type { SavePastedImageResult } from '../shared/types'

/**
 * Stores a clipboard image in `notes/img/<note name>/` and returns the path
 * relative to the note's Markdown file.
 */
export async function saveNotePastedImage(
  noteId: string,
  data: Uint8Array
): Promise<SavePastedImageResult> {
  const file = trackedNoteFile(noteId)
  if (!file) {
    return { ok: false, message: '这篇笔记还没有写入本地文件，请稍后再粘贴图片。' }
  }

  const directory = noteImageDirectory(file)
  const stored = await storePastedImage(directory, data)
  if (!stored.ok) return stored

  trackPendingNoteImage(directory, stored.image.fileName)

  const stem = noteFileStem(file)
  return {
    ok: true,
    relativePath: `img/${stem}/${stored.image.fileName}`,
    fileName: stored.image.fileName
  }
}

/**
 * Serves note images for the `qimu-file://note/...` protocol. Only notes the
 * main process knows about are eligible, and the path must stay inside the
 * notes directory.
 */
export async function readNoteAsset(noteId: string, source: string): Promise<ImageAsset | null> {
  if (!trackedNoteFile(noteId)) return null
  return readImageAsset(getAppDataPaths().notesDir, source, true)
}
