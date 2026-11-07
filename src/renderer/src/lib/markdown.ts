import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true
})

interface RenderMarkdownOptions {
  /** Maps a relative image source to a URL the renderer is allowed to load. */
  resolveImageSource?: (source: string) => string | null
}

export function renderMarkdown(markdown: string, options: RenderMarkdownOptions = {}): string {
  if (!markdown.trim()) return ''
  const raw = marked.parse(markdown, { async: false }) as string
  const sanitized = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick']
  })
  if (!options.resolveImageSource) return sanitized

  // Sanitize first, then map sources. This keeps arbitrary HTML on the same
  // sanitizer path while still supporting raw <img> tags in Markdown.
  const template = document.createElement('template')
  template.innerHTML = sanitized
  for (const image of template.content.querySelectorAll('img[src]')) {
    const source = image.getAttribute('src')
    if (!source) continue
    const resolved = options.resolveImageSource(source)
    if (resolved) image.setAttribute('src', resolved)
  }
  return template.innerHTML
}

export function getExcerpt(markdown: string, length = 100): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\(<[^>]*>\)/g, ' [图片] ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' [图片] ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_~#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > length ? `${plain.slice(0, length)}…` : plain
}
