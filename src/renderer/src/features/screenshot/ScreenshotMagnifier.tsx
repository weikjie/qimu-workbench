import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ScreenshotPoint } from '@shared/screenshot'
import { cn } from '../../lib/cn'
import { screenshotBridge } from '../../services/desktop'

/** Lens viewport size in CSS pixels. */
const LENS_WIDTH = 160
const LENS_HEIGHT = 160
/** Magnification factor: one captured pixel becomes LENS_ZOOM CSS pixels. */
const LENS_ZOOM = 5
/** Distance between the pointer and the panel. */
const LENS_GAP = 18
/** Safe distance from the window edges. */
const LENS_MARGIN = 12
/** Space between the lens and the color row. */
const COLOR_ROW_GAP = 4
const COLOR_ROW_HEIGHT = 24
/** Space between the color row and the shortcut hints. */
const HINTS_GAP = 6
const HINT_LINE_HEIGHT = 16
const HINT_LINES = 2
const PANEL_WIDTH = LENS_WIDTH
const PANEL_HEIGHT =
  LENS_HEIGHT + COLOR_ROW_GAP + COLOR_ROW_HEIGHT + HINTS_GAP + HINT_LINE_HEIGHT * HINT_LINES

const CROSSHAIR_LIGHT = '#e9f1eb'
const CROSSHAIR_DARK = '#3b5f49'

type ColorFormat = 'hex' | 'rgb'
type CopyState = 'idle' | 'copied' | 'error'

interface RgbColor {
  r: number
  g: number
  b: number
}

interface ScreenshotMagnifierProps {
  image: HTMLImageElement
  viewport: { width: number; height: number }
  cursor: ScreenshotPoint
}

interface LensLayout {
  left: number
  top: number
  /** Top-left of the sampled region in viewport coordinates. */
  sourceLeft: number
  sourceTop: number
  /** Crosshair position inside the lens, in CSS pixels. */
  crossX: number
  crossY: number
  /** Exact pointer position inside the lens, in CSS pixels. */
  colorX: number
  colorY: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function layoutLens(
  cursor: ScreenshotPoint,
  viewport: { width: number; height: number }
): LensLayout {
  const sourceWidth = LENS_WIDTH / LENS_ZOOM
  const sourceHeight = LENS_HEIGHT / LENS_ZOOM
  const pointerX = clamp(cursor.x, 0, Math.max(0, viewport.width - 1))
  const pointerY = clamp(cursor.y, 0, Math.max(0, viewport.height - 1))

  // Clamp the sampled region to the display so the lens never reads past the
  // captured image. Near an edge the crosshair shifts off-center accordingly;
  // its intersection always marks the pointer's pixel.
  const sourceLeft = clamp(
    pointerX - sourceWidth / 2,
    0,
    Math.max(0, viewport.width - sourceWidth)
  )
  const sourceTop = clamp(
    pointerY - sourceHeight / 2,
    0,
    Math.max(0, viewport.height - sourceHeight)
  )

  let left = pointerX + LENS_GAP
  if (left + PANEL_WIDTH > viewport.width - LENS_MARGIN) {
    left = pointerX - LENS_GAP - PANEL_WIDTH
  }
  left = clamp(left, LENS_MARGIN, Math.max(LENS_MARGIN, viewport.width - PANEL_WIDTH - LENS_MARGIN))

  let top = pointerY + LENS_GAP
  if (top + PANEL_HEIGHT > viewport.height - LENS_MARGIN) {
    top = pointerY - LENS_GAP - PANEL_HEIGHT
  }
  top = clamp(
    top,
    LENS_MARGIN,
    Math.max(LENS_MARGIN, viewport.height - PANEL_HEIGHT - LENS_MARGIN)
  )

  return {
    left: Math.round(left),
    top: Math.round(top),
    sourceLeft,
    sourceTop,
    crossX: Math.round(clamp((pointerX - sourceLeft) * LENS_ZOOM, 0, LENS_WIDTH - 1)),
    crossY: Math.round(clamp((pointerY - sourceTop) * LENS_ZOOM, 0, LENS_HEIGHT - 1)),
    colorX: clamp((pointerX - sourceLeft) * LENS_ZOOM, 0, LENS_WIDTH - 1),
    colorY: clamp((pointerY - sourceTop) * LENS_ZOOM, 0, LENS_HEIGHT - 1)
  }
}

function relativeLuminance(color: RgbColor): number {
  return (color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722) / 255
}

function formatColor(color: RgbColor | null, format: ColorFormat): string {
  if (!color) return '—'
  if (format === 'rgb') return `rgb(${color.r}, ${color.g}, ${color.b})`
  const channel = (value: number): string => value.toString(16).padStart(2, '0')
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`.toUpperCase()
}

/**
 * Floating pixel magnifier shown before a region is selected. It samples the
 * frozen screenshot around the pointer and marks the exact pointer pixel with
 * a one-pixel crosshair whose color adapts to the underlying pixels so it stays
 * visible on both light and dark content. The sampled color and the Shift / C
 * hints sit in a separate strip below the square lens.
 */
export function ScreenshotMagnifier({
  image,
  viewport,
  cursor
}: ScreenshotMagnifierProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const layout = useMemo(() => layoutLens(cursor, viewport), [cursor, viewport])
  const [pixelColor, setPixelColor] = useState<RgbColor | null>(null)
  const [format, setFormat] = useState<ColorFormat>('hex')
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const copyTimerRef = useRef<number | null>(null)
  const colorText = useMemo(() => formatColor(pixelColor, format), [format, pixelColor])

  const flashCopyState = useCallback((next: CopyState) => {
    setCopyState(next)
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = window.setTimeout(() => {
      copyTimerRef.current = null
      setCopyState('idle')
    }, 1200)
  }, [])

  const copyColor = useCallback((): void => {
    if (!pixelColor) return
    void screenshotBridge
      .copyText(colorText)
      .then((result) => {
        flashCopyState(result.ok ? 'copied' : 'error')
      })
      .catch((error: unknown) => {
        console.error('[screenshot] could not copy color:', error)
        flashCopyState('error')
      })
  }, [colorText, flashCopyState, pixelColor])
  const copyColorRef = useRef<() => void>(() => {})

  useEffect(() => {
    copyColorRef.current = copyColor
  }, [copyColor])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Shift') {
        if (!event.repeat) setFormat((current) => (current === 'hex' ? 'rgb' : 'hex'))
        return
      }
      if (
        !event.repeat &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'c'
      ) {
        event.preventDefault()
        copyColorRef.current()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || viewport.width < 1 || viewport.height < 1) return

    const dpr = window.devicePixelRatio || 1
    const pixelWidth = Math.max(1, Math.round(LENS_WIDTH * dpr))
    const pixelHeight = Math.max(1, Math.round(LENS_HEIGHT * dpr))
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, LENS_WIDTH, LENS_HEIGHT)
    ctx.imageSmoothingEnabled = false

    const scaleX = image.naturalWidth / Math.max(1, viewport.width)
    const scaleY = image.naturalHeight / Math.max(1, viewport.height)
    const sourceWidth = LENS_WIDTH / LENS_ZOOM
    const sourceHeight = LENS_HEIGHT / LENS_ZOOM

    ctx.drawImage(
      image,
      layout.sourceLeft * scaleX,
      layout.sourceTop * scaleY,
      sourceWidth * scaleX,
      sourceHeight * scaleY,
      0,
      0,
      LENS_WIDTH,
      LENS_HEIGHT
    )

    // Read the magnified picture before drawing the crosshair so each 1px
    // segment can pick a color that contrasts with the pixels beneath it.
    const pixels = ctx.getImageData(0, 0, pixelWidth, pixelHeight).data
    const sampleRatioX = pixelWidth / LENS_WIDTH
    const sampleRatioY = pixelHeight / LENS_HEIGHT
    const sampleColor = (cssX: number, cssY: number): RgbColor => {
      const x = clamp(Math.floor((cssX + 0.5) * sampleRatioX), 0, pixelWidth - 1)
      const y = clamp(Math.floor((cssY + 0.5) * sampleRatioY), 0, pixelHeight - 1)
      const offset = (y * pixelWidth + x) * 4
      return {
        r: pixels[offset] ?? 0,
        g: pixels[offset + 1] ?? 0,
        b: pixels[offset + 2] ?? 0
      }
    }

    const sampled = sampleColor(layout.colorX, layout.colorY)
    setPixelColor((current) =>
      current &&
      current.r === sampled.r &&
      current.g === sampled.g &&
      current.b === sampled.b
        ? current
        : sampled
    )

    const pickColor = (cssX: number, cssY: number): string =>
      relativeLuminance(sampleColor(cssX, cssY)) > 0.5 ? CROSSHAIR_DARK : CROSSHAIR_LIGHT

    const drawVertical = (): void => {
      let runStart = 0
      let runColor = pickColor(layout.crossX, 0)
      for (let y = 1; y <= LENS_HEIGHT; y += 1) {
        const nextColor = y < LENS_HEIGHT ? pickColor(layout.crossX, y) : null
        if (nextColor === runColor) continue
        ctx.fillStyle = runColor
        ctx.fillRect(layout.crossX, runStart, 1, y - runStart)
        if (nextColor) {
          runColor = nextColor
          runStart = y
        }
      }
    }

    const drawHorizontal = (): void => {
      let runStart = 0
      let runColor = pickColor(0, layout.crossY)
      for (let x = 1; x <= LENS_WIDTH; x += 1) {
        const nextColor = x < LENS_WIDTH ? pickColor(x, layout.crossY) : null
        if (nextColor === runColor) continue
        ctx.fillStyle = runColor
        ctx.fillRect(runStart, layout.crossY, x - runStart, 1)
        if (nextColor) {
          runColor = nextColor
          runStart = x
        }
      }
    }

    drawVertical()
    drawHorizontal()
  }, [image, layout, viewport.height, viewport.width])

  return (
    <div
      className="shot-magnifier"
      style={{ left: layout.left, top: layout.top, width: PANEL_WIDTH }}
      aria-hidden="true"
    >
      <div className="shot-magnifier__lens" style={{ height: LENS_HEIGHT }}>
        <canvas ref={canvasRef} className="shot-magnifier__canvas" />
      </div>
      <div className="shot-magnifier__color">
        <span
          className="shot-magnifier__swatch"
          style={{
            backgroundColor: pixelColor
              ? `rgb(${pixelColor.r}, ${pixelColor.g}, ${pixelColor.b})`
              : 'transparent'
          }}
        />
        <span className="shot-magnifier__value">{colorText}</span>
      </div>
      <div className="shot-magnifier__hints">
        <span
          className={cn(
            'shot-magnifier__hint',
            copyState === 'copied' && 'is-ok',
            copyState === 'error' && 'is-error'
          )}
        >
          {copyState === 'copied' ? '已复制' : copyState === 'error' ? '复制失败' : '按 C 复制'}
        </span>
        <span className="shot-magnifier__hint">按 Shift 切换</span>
      </div>
    </div>
  )
}
