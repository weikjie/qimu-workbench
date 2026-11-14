import type { ScreenshotPoint, ScreenshotRect, ScreenshotTool } from '@shared/screenshot'

export const TEXT_FONT_FAMILY =
  '"MiSans", "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif'
export const TEXT_LINE_HEIGHT = 1.3

export interface RectangleAnnotation {
  id: string
  type: 'rectangle'
  start: ScreenshotPoint
  end: ScreenshotPoint
  color: string
  thickness: number
}

export interface LineAnnotation {
  id: string
  type: 'line'
  start: ScreenshotPoint
  end: ScreenshotPoint
  color: string
  thickness: number
}

export interface EllipseAnnotation {
  id: string
  type: 'ellipse'
  start: ScreenshotPoint
  end: ScreenshotPoint
  color: string
  thickness: number
}

export interface ArrowAnnotation {
  id: string
  type: 'arrow'
  start: ScreenshotPoint
  end: ScreenshotPoint
  color: string
  thickness: number
}

export interface PenAnnotation {
  id: string
  type: 'pen'
  points: ScreenshotPoint[]
  color: string
  thickness: number
}

export interface TextAnnotation {
  id: string
  type: 'text'
  point: ScreenshotPoint
  text: string
  color: string
  fontSize: number
}

export interface MosaicAnnotation {
  id: string
  type: 'mosaic'
  start: ScreenshotPoint
  end: ScreenshotPoint
  block: number
}

export type Annotation =
  | RectangleAnnotation
  | LineAnnotation
  | EllipseAnnotation
  | ArrowAnnotation
  | PenAnnotation
  | TextAnnotation
  | MosaicAnnotation

export type ShapeTool = Extract<ScreenshotTool, 'rectangle' | 'line' | 'ellipse' | 'arrow'>

let nextId = 1

function createId(): string {
  nextId += 1
  return `annotation-${Date.now().toString(36)}-${nextId.toString(36)}`
}

export function normalizeRect(start: ScreenshotPoint, end: ScreenshotPoint): ScreenshotRect {
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  }
}

export function distance(a: ScreenshotPoint, b: ScreenshotPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function clampPoint(point: ScreenshotPoint, width: number, height: number): ScreenshotPoint {
  return {
    x: Math.min(Math.max(point.x, 0), width),
    y: Math.min(Math.max(point.y, 0), height)
  }
}

export function clampRect(rect: ScreenshotRect, width: number, height: number): ScreenshotRect {
  const left = Math.min(Math.max(rect.x, 0), width)
  const top = Math.min(Math.max(rect.y, 0), height)
  const right = Math.min(Math.max(rect.x + rect.width, left), width)
  const bottom = Math.min(Math.max(rect.y + rect.height, top), height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function createShapeDraft(
  tool: ShapeTool,
  start: ScreenshotPoint,
  color: string,
  thickness: number
): Annotation {
  return {
    id: createId(),
    type: tool,
    start,
    end: { ...start },
    color,
    thickness
  }
}

export function createPenDraft(
  point: ScreenshotPoint,
  color: string,
  thickness: number
): PenAnnotation {
  return {
    id: createId(),
    type: 'pen',
    points: [{ ...point }],
    color,
    thickness
  }
}

export function createMosaicDraft(start: ScreenshotPoint, block: number): MosaicAnnotation {
  return {
    id: createId(),
    type: 'mosaic',
    start: { ...start },
    end: { ...start },
    block
  }
}

export function createTextAnnotation(
  point: ScreenshotPoint,
  text: string,
  color: string,
  fontSize: number
): TextAnnotation {
  return {
    id: createId(),
    type: 'text',
    point: { ...point },
    text,
    color,
    fontSize
  }
}

export function withDraftEnd(annotation: Annotation, end: ScreenshotPoint): Annotation {
  if (annotation.type === 'pen') {
    const last = annotation.points[annotation.points.length - 1]
    if (last && distance(last, end) < 1.2) return annotation
    return { ...annotation, points: [...annotation.points, { ...end }] }
  }
  if (annotation.type === 'mosaic' || annotation.type === 'rectangle' || annotation.type === 'line' || annotation.type === 'ellipse' || annotation.type === 'arrow') {
    return { ...annotation, end: { ...end } }
  }
  return annotation
}

export function isMeaningfulDraft(annotation: Annotation): boolean {
  if (annotation.type === 'pen') return annotation.points.length > 1
  if (annotation.type === 'text') return annotation.text.trim().length > 0
  const rect = normalizeRect(annotation.start, annotation.end)
  return rect.width >= 2 || rect.height >= 2
}

export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: readonly Annotation[],
  source: {
    image: HTMLImageElement | null
    imageScaleX: number
    imageScaleY: number
  }
): void {
  for (const annotation of annotations) {
    drawAnnotation(ctx, annotation, source)
  }
}

let mosaicCanvas: HTMLCanvasElement | null = null
let textMeasureContext: CanvasRenderingContext2D | null = null

/** Measures the widest line of a text annotation with the canvas font used
 * when the annotation is rendered. Used to keep the inline editor compact. */
export function measureTextWidth(text: string, fontSize: number): number {
  if (!textMeasureContext) {
    const canvas = document.createElement('canvas')
    textMeasureContext = canvas.getContext('2d')
  }
  if (!textMeasureContext) return 80
  textMeasureContext.font = `600 ${Math.max(8, fontSize)}px ${TEXT_FONT_FAMILY}`
  const lines = text.length > 0 ? text.split('\n') : [' ']
  return Math.max(...lines.map((line) => textMeasureContext!.measureText(line || ' ').width))
}

function mosaicScratch(columns: number, rows: number): CanvasRenderingContext2D | null {
  if (!mosaicCanvas) mosaicCanvas = document.createElement('canvas')
  if (mosaicCanvas.width !== columns || mosaicCanvas.height !== rows) {
    mosaicCanvas.width = columns
    mosaicCanvas.height = rows
  }
  const context = mosaicCanvas.getContext('2d')
  if (!context) return null
  context.clearRect(0, 0, columns, rows)
  return context
}

function drawMosaic(
  ctx: CanvasRenderingContext2D,
  annotation: MosaicAnnotation,
  source: {
    image: HTMLImageElement | null
    imageScaleX: number
    imageScaleY: number
  }
): void {
  if (!source.image) return
  const rect = normalizeRect(annotation.start, annotation.end)
  if (rect.width < 1 || rect.height < 1) return

  const block = Math.max(2, annotation.block)
  const columns = Math.max(1, Math.round(rect.width / block))
  const rows = Math.max(1, Math.round(rect.height / block))
  const scratch = mosaicScratch(columns, rows)
  if (!scratch) return

  const sourceX = Math.max(0, rect.x * source.imageScaleX)
  const sourceY = Math.max(0, rect.y * source.imageScaleY)
  const sourceWidth = Math.max(1, rect.width * source.imageScaleX)
  const sourceHeight = Math.max(1, rect.height * source.imageScaleY)

  scratch.imageSmoothingEnabled = true
  scratch.drawImage(
    source.image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    columns,
    rows
  )

  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    mosaicCanvas!,
    0,
    0,
    columns,
    rows,
    rect.x,
    rect.y,
    rect.width,
    rect.height
  )
  ctx.restore()
}

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  source: {
    image: HTMLImageElement | null
    imageScaleX: number
    imageScaleY: number
  }
): void {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (annotation.type) {
    case 'rectangle': {
      const rect = normalizeRect(annotation.start, annotation.end)
      if (rect.width < 1 && rect.height < 1) break
      ctx.strokeStyle = annotation.color
      ctx.lineWidth = annotation.thickness
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
      break
    }
    case 'line': {
      ctx.strokeStyle = annotation.color
      ctx.lineWidth = annotation.thickness
      ctx.beginPath()
      ctx.moveTo(annotation.start.x, annotation.start.y)
      ctx.lineTo(annotation.end.x, annotation.end.y)
      ctx.stroke()
      break
    }
    case 'ellipse': {
      const rect = normalizeRect(annotation.start, annotation.end)
      if (rect.width < 1 && rect.height < 1) break
      ctx.strokeStyle = annotation.color
      ctx.lineWidth = annotation.thickness
      ctx.beginPath()
      ctx.ellipse(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
        rect.width / 2,
        rect.height / 2,
        0,
        0,
        Math.PI * 2
      )
      ctx.stroke()
      break
    }
    case 'arrow': {
      const start = annotation.start
      const end = annotation.end
      const angle = Math.atan2(end.y - start.y, end.x - start.x)
      const length = Math.hypot(end.x - start.x, end.y - start.y)
      if (length < 1) break
      const headLength = Math.min(length, Math.max(11, annotation.thickness * 3.6))
      const headHalf = headLength * 0.42

      ctx.strokeStyle = annotation.color
      ctx.fillStyle = annotation.color
      ctx.lineWidth = annotation.thickness
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(
        end.x - Math.cos(angle) * headLength * 0.55,
        end.y - Math.sin(angle) * headLength * 0.55
      )
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(end.x, end.y)
      ctx.lineTo(
        end.x - Math.cos(angle - Math.atan2(headHalf, headLength)) * headLength,
        end.y - Math.sin(angle - Math.atan2(headHalf, headLength)) * headLength
      )
      ctx.lineTo(
        end.x - Math.cos(angle + Math.atan2(headHalf, headLength)) * headLength,
        end.y - Math.sin(angle + Math.atan2(headHalf, headLength)) * headLength
      )
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'pen': {
      if (annotation.points.length === 0) break
      ctx.strokeStyle = annotation.color
      ctx.lineWidth = annotation.thickness
      if (annotation.points.length === 1) {
        ctx.fillStyle = annotation.color
        ctx.beginPath()
        ctx.arc(
          annotation.points[0]!.x,
          annotation.points[0]!.y,
          Math.max(1, annotation.thickness / 2),
          0,
          Math.PI * 2
        )
        ctx.fill()
        break
      }
      ctx.beginPath()
      ctx.moveTo(annotation.points[0]!.x, annotation.points[0]!.y)
      for (let index = 1; index < annotation.points.length; index += 1) {
        const point = annotation.points[index]!
        ctx.lineTo(point.x, point.y)
      }
      ctx.stroke()
      break
    }
    case 'text': {
      const fontSize = Math.max(8, annotation.fontSize)
      const lineHeight = fontSize * TEXT_LINE_HEIGHT
      ctx.fillStyle = annotation.color
      ctx.textBaseline = 'top'
      ctx.font = `600 ${fontSize}px ${TEXT_FONT_FAMILY}`
      annotation.text.split('\n').forEach((line, index) => {
        ctx.fillText(line, annotation.point.x + 2, annotation.point.y + 2 + index * lineHeight)
      })
      break
    }
    case 'mosaic': {
      drawMosaic(ctx, annotation, source)
      break
    }
  }

  ctx.restore()
}

export interface RenderSelectionOptions {
  image: HTMLImageElement
  viewWidth: number
  viewHeight: number
  selection: ScreenshotRect
  annotations: readonly Annotation[]
}

/** Renders the final, native-resolution crop with all annotations applied. */
export function renderSelectionCanvas(options: RenderSelectionOptions): HTMLCanvasElement {
  const { image, viewWidth, viewHeight, selection, annotations } = options
  const scaleX = image.naturalWidth / Math.max(1, viewWidth)
  const scaleY = image.naturalHeight / Math.max(1, viewHeight)
  const width = Math.max(1, Math.round(selection.width * scaleX))
  const height = Math.max(1, Math.round(selection.height * scaleY))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.setTransform(scaleX, 0, 0, scaleY, -selection.x * scaleX, -selection.y * scaleY)
  ctx.drawImage(image, 0, 0, viewWidth, viewHeight)

  ctx.save()
  ctx.beginPath()
  ctx.rect(selection.x, selection.y, selection.width, selection.height)
  ctx.clip()
  drawAnnotations(ctx, annotations, { image, imageScaleX: scaleX, imageScaleY: scaleY })
  ctx.restore()

  return canvas
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('无法生成截图图片。'))
    }, 'image/png')
  })
}
