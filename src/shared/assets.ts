export const EXTERNAL_ASSET_SCHEME = 'qimu-file'

// Local assets are resolved relative to the Markdown file that references
// them. Absolute paths, protocols, fragments and protocol-relative URLs are
// left to Chromium or ignored instead of being proxied through the app.
const NON_RELATIVE_SOURCE = /^(?:[a-z][a-z\d+.-]*:|[#/\\])/i

export function createExternalAssetUrl(documentId: string, source: string): string | null {
  const trimmed = source.trim()
  if (!trimmed || NON_RELATIVE_SOURCE.test(trimmed)) return null

  const path = trimmed.split(/[?#]/, 1)[0]?.replace(/\\/g, '/')
  if (!path) return null

  return `${EXTERNAL_ASSET_SCHEME}://doc/${encodeURIComponent(documentId)}?path=${encodeURIComponent(path)}`
}
