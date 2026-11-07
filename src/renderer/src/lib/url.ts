export function normalizeUrlInput(input: string): string | null {
  const candidate = input.trim()
  if (!candidate) return null

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate) ? candidate : `https://${candidate}`
  try {
    const url = new URL(withProtocol)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.hostname) return null
    return url.toString()
  } catch {
    return null
  }
}

export function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function getLinkInitial(title: string, url: string): string {
  const trimmed = title.trim()
  if (trimmed) return Array.from(trimmed)[0] ?? '↗'
  const host = getHostname(url)
  return host.charAt(0).toUpperCase() || '↗'
}

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

export function getLinkTone(url: string): number {
  return hashString(getHostname(url)) % 6
}
