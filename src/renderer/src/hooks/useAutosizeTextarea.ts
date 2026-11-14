import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react'

interface AutosizeOptions {
  /** Keep at least this many text lines visible. */
  minRows?: number
  /** Stop growing after this many lines; longer content scrolls instead. */
  maxRows?: number
  /** Skip measuring while the textarea is not mounted or not in use. */
  enabled?: boolean
}

const DEFAULT_MIN_ROWS = 1
const DEFAULT_MAX_ROWS = 50

/**
 * Grows a textarea with its content, including soft-wrapped lines. Once the
 * content exceeds `maxRows` the textarea keeps that height and scrolls.
 * Returns whether the content currently occupies more than `minRows` lines.
 */
export function useAutosizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  options: AutosizeOptions = {}
): boolean {
  const { minRows = DEFAULT_MIN_ROWS, maxRows = DEFAULT_MAX_ROWS, enabled = true } = options
  const [multiline, setMultiline] = useState(false)

  const measure = useCallback(() => {
    const element = ref.current
    if (!element) return

    const styles = window.getComputedStyle(element)
    const fontSize = Number.parseFloat(styles.fontSize) || 14
    const lineHeight = Number.parseFloat(styles.lineHeight) || fontSize * 1.5
    const padding =
      (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0)
    const border =
      (Number.parseFloat(styles.borderTopWidth) || 0) +
      (Number.parseFloat(styles.borderBottomWidth) || 0)

    const minHeight = Math.ceil(minRows * lineHeight + padding + border)
    const maxHeight = Math.ceil(maxRows * lineHeight + padding + border)

    // Collapse first so `scrollHeight` reports the height the content wants.
    element.style.height = 'auto'
    const contentHeight = element.scrollHeight + border
    const nextHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight)
    element.style.height = `${nextHeight}px`
    element.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden'

    const wraps = contentHeight > minHeight + 1
    setMultiline((current) => (current === wraps ? current : wraps))
  }, [ref, minRows, maxRows])

  useLayoutEffect(() => {
    if (enabled) measure()
  }, [enabled, measure, value])

  useEffect(() => {
    if (!enabled) return
    // A narrower window rewraps the text, so the height must be recomputed.
    const handleResize = (): void => measure()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [enabled, measure])

  return multiline
}
