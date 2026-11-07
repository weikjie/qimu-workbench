export const EXTERNAL_ASSET_SCHEME = 'qimu-file'
export const NOTE_ASSET_HOST = 'note'
export const EXTERNAL_ASSET_HOST = 'doc'

// Local assets are resolved relative to the Markdown file that references
// them. Absolute paths, protocols, fragments and protocol-relative URLs are
// left to Chromium or ignored instead of being proxied through the app.
const NON_RELATIVE_SOURCE = /^(?:[a-z][a-z\d+.-]*:|[#/\\])/i

function createAssetUrl(host: string, id: string, source: string): string | null {
  const trimmed = source.trim()
  if (!trimmed || NON_RELATIVE_SOURCE.test(trimmed)) return null

  const path = trimmed.split(/[?#]/, 1)[0]?.replace(/\\/g, '/')
  if (!path) return null

  return `${EXTERNAL_ASSET_SCHEME}://${host}/${encodeURIComponent(id)}?path=${encodeURIComponent(path)}`
}

export function createExternalAssetUrl(documentId: string, source: string): string | null {
  return createAssetUrl(EXTERNAL_ASSET_HOST, documentId, source)
}

export function createNoteAssetUrl(noteId: string, source: string): string | null {
  return createAssetUrl(NOTE_ASSET_HOST, noteId, source)
}

/**
 * Builds a Markdown image reference for a path relative to the current file.
 * Angle brackets keep spaces and parentheses intact; `%`, `#` and `?` are
 * percent-encoded so the URL resolver always sees the real file name.
 */
export function createImageMarkdown(relativePath: string, alt = '图片'): string {
  const destination = relativePath
    .replace(/\\/g, '/')
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/\?/g, '%3F')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
  return `![${alt}](<${destination}>)`
}
