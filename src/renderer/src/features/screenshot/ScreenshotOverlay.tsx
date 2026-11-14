import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import { LoaderCircle } from 'lucide-react'
import type {
  ScreenshotAction,
  ScreenshotOverlayContext,
  ScreenshotPoint,
  ScreenshotRect,
  ScreenshotTool
} from '@shared/screenshot'
import { cn } from '../../lib/cn'
import { screenshotBridge } from '../../services/desktop'
import { ScreenshotMagnifier } from './ScreenshotMagnifier'
import { ScreenshotToolbar } from './ScreenshotToolbar'
import {
  canvasToPngBlob,
  clampPoint,
  clampRect,
  createMosaicDraft,
  createPenDraft,
  createShapeDraft,
  createTextAnnotation,
  drawAnnotations,
  isMeaningfulDraft,
  measureTextWidth,
  normalizeRect,
  renderSelectionCanvas,
  TEXT_FONT_FAMILY,
  TEXT_LINE_HEIGHT,
  withDraftEnd,
  type Annotation,
  type ShapeTool
} from './annotation'

const TOOL_KEYS: Record<string, ScreenshotTool> = {
  r: 'rectangle',
  l: 'line',
  e: 'ellipse',
  p: 'pen',
  a: 'arrow',
  t: 'text',
  m: 'mosaic'
}

const SHAPE_TOOLS: ReadonlySet<ScreenshotTool> = new Set([
  'rectangle',
  'line',
  'ellipse',
  'arrow'
])

function isShapeTool(tool: ScreenshotTool): tool is ShapeTool {
  return SHAPE_TOOLS.has(tool)
}

type DragState =
  | { kind: 'select'; pointerId: number; start: ScreenshotPoint }
  | { kind: 'draw'; pointerId: number; start: ScreenshotPoint }

interface TextEditorState {
  id: number
  point: ScreenshotPoint
  value: string
  color: string
  fontSize: number
}

interface ScreenshotOverlayProps {
  sessionId: string
  displayId: number
}

function useViewport(): { width: number; height: number } {
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }))

  useEffect(() => {
    const update = (): void => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return viewport
}

function dimRects(
  selection: ScreenshotRect | null,
  viewport: { width: number; height: number }
): CSSProperties[] {
  if (!selection || selection.width < 1 || selection.height < 1) {
    return [{ left: 0, top: 0, width: viewport.width, height: viewport.height }]
  }
  const left = Math.max(0, selection.x)
  const top = Math.max(0, selection.y)
  const right = Math.min(viewport.width, selection.x + selection.width)
  const bottom = Math.min(viewport.height, selection.y + selection.height)
  return [
    { left: 0, top: 0, width: viewport.width, height: top },
    { left: 0, top: bottom, width: viewport.width, height: Math.max(0, viewport.height - bottom) },
    { left: 0, top, width: left, height: Math.max(0, bottom - top) },
    {
      left: right,
      top,
      width: Math.max(0, viewport.width - right),
      height: Math.max(0, bottom - top)
    }
  ]
}

function pointInRect(point: ScreenshotPoint, rect: ScreenshotRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function ScreenshotOverlay({
  sessionId,
  displayId
}: ScreenshotOverlayProps): React.JSX.Element {
  const viewport = useViewport()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const imageUrlRef = useRef<string | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const draftRef = useRef<Annotation | null>(null)
  const annotationsRef = useRef<Annotation[]>([])
  const textDraftRef = useRef<TextEditorState | null>(null)
  const textSessionRef = useRef(0)

  const [context, setContext] = useState<ScreenshotOverlayContext | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'select' | 'annotate'>('select')
  const [selection, setSelection] = useState<ScreenshotRect | null>(null)
  const [tool, setTool] = useState<ScreenshotTool>('rectangle')
  const [color, setColor] = useState('#ff4d4f')
  const [thickness, setThickness] = useState(3)
  const [fontSize, setFontSize] = useState(20)
  const [mosaicBlock, setMosaicBlock] = useState(12)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [redoStack, setRedoStack] = useState<Annotation[]>([])
  const [draft, setDraft] = useState<Annotation | null>(null)
  const [textDraft, setTextDraft] = useState<TextEditorState | null>(null)
  const [busy, setBusy] = useState<ScreenshotAction | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toolbarPos, setToolbarPos] = useState<{ left: number; top: number } | null>(null)
  const [cursor, setCursor] = useState<ScreenshotPoint | null>(null)

  const valid = Boolean(sessionId) && Number.isFinite(displayId)

  useEffect(() => {
    document.title = '截图'
    if (!valid) {
      setLoadError('截图参数无效。')
      return
    }

    let disposed = false
    screenshotBridge
      .getOverlayContext(sessionId, displayId)
      .then((data) => {
        if (disposed) return
        if (!data) {
          setLoadError('截图会话已结束。')
          return
        }
        setContext(data)
        const blob = new Blob([data.png], { type: 'image/png' })
        const url = URL.createObjectURL(blob)
        imageUrlRef.current = url
        setImageUrl(url)
        const bitmap = new Image()
        bitmap.decoding = 'async'
        bitmap.onload = () => {
          if (!disposed) setImage(bitmap)
        }
        bitmap.onerror = () => {
          if (!disposed) setLoadError('无法载入屏幕画面。')
        }
        bitmap.src = url
      })
      .catch((error: unknown) => {
        if (disposed) return
        console.error('[screenshot] could not load overlay context:', error)
        setLoadError('无法读取屏幕画面。')
      })

    return () => {
      disposed = true
    }
  }, [sessionId, displayId, valid])

  useEffect(() => {
    return () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current)
        imageUrlRef.current = null
      }
    }
  }, [])

  const updateAnnotations = useCallback((next: Annotation[]) => {
    annotationsRef.current = next
    setAnnotations(next)
  }, [])

  const updateDraft = useCallback((next: Annotation | null) => {
    draftRef.current = next
    setDraft(next)
  }, [])

  const undo = useCallback(() => {
    const current = annotationsRef.current
    if (current.length === 0 || busy) return
    const last = current[current.length - 1]!
    updateAnnotations(current.slice(0, -1))
    setRedoStack((stack) => [...stack, last])
    setActionError(null)
  }, [busy, updateAnnotations])

  const redo = useCallback(() => {
    if (redoStack.length === 0 || busy) return
    const next = redoStack[redoStack.length - 1]!
    updateAnnotations([...annotationsRef.current, next])
    setRedoStack(redoStack.slice(0, -1))
    setActionError(null)
  }, [busy, redoStack, updateAnnotations])

  const commitText = useCallback((): void => {
    const current = textDraftRef.current
    if (!current) return
    textDraftRef.current = null
    setTextDraft(null)
    const text = current.value.replace(/\s+$/, '')
    if (!text.trim()) return
    const annotation = createTextAnnotation(current.point, text, current.color, current.fontSize)
    updateAnnotations([...annotationsRef.current, annotation])
    setRedoStack([])
  }, [updateAnnotations])

  const cancelText = useCallback(() => {
    textDraftRef.current = null
    setTextDraft(null)
  }, [])

  const startText = useCallback(
    (point: ScreenshotPoint) => {
      if (!selection) return
      const right = selection.x + selection.width
      const bottom = selection.y + selection.height
      const left = clamp(point.x, selection.x + 2, Math.max(selection.x + 2, right - 40))
      const top = clamp(point.y, selection.y + 2, Math.max(selection.y + 2, bottom - 24))
      textSessionRef.current += 1
      const next: TextEditorState = {
        id: textSessionRef.current,
        point: { x: left, y: top },
        value: '',
        color,
        fontSize
      }
      textDraftRef.current = next
      setTextDraft(next)
    },
    [color, fontSize, selection]
  )

  const changeTool = useCallback(
    (nextTool: ScreenshotTool) => {
      commitText()
      setTool(nextTool)
      setActionError(null)
    },
    [commitText]
  )

  const finish = useCallback(
    async (action: ScreenshotAction) => {
      if (!selection || !image || !context || busy) return
      commitText()
      setBusy(action)
      setActionError(null)

      try {
        const canvas = renderSelectionCanvas({
          image,
          viewWidth: viewport.width,
          viewHeight: viewport.height,
          selection,
          annotations: annotationsRef.current
        })
        const blob = await canvasToPngBlob(canvas)
        const png = await blob.arrayBuffer()
        const scaleX = context.display.width / Math.max(1, viewport.width)
        const scaleY = context.display.height / Math.max(1, viewport.height)
        const result = await screenshotBridge.finish({
          sessionId,
          displayId,
          action,
          png,
          selection: {
            x: selection.x * scaleX,
            y: selection.y * scaleY,
            width: selection.width * scaleX,
            height: selection.height * scaleY
          }
        })
        if (!result.ok && !result.canceled) {
          setActionError(result.message ?? '截图操作失败，请稍后重试。')
        }
      } catch (error) {
        console.error('[screenshot] finish failed:', error)
        setActionError('截图操作失败，请稍后重试。')
      } finally {
        setBusy(null)
      }
    },
    [busy, commitText, context, displayId, image, selection, sessionId, viewport]
  )

  const cancel = useCallback(() => {
    if (busy) return
    screenshotBridge.cancel(sessionId)
  }, [busy, sessionId])

  const pointFromEvent = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): ScreenshotPoint =>
      clampPoint(
        { x: event.clientX, y: event.clientY },
        viewport.width,
        viewport.height
      ),
    [viewport.height, viewport.width]
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('.shot-ui')) return
      if (event.button !== 0 || busy || !image) return
      event.preventDefault()

      if (phase === 'select') {
        const point = pointFromEvent(event)
        setSelection({ x: point.x, y: point.y, width: 0, height: 0 })
        dragRef.current = { kind: 'select', pointerId: event.pointerId, start: point }
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // Pointer capture is best-effort; normal bubbling still works.
        }
        return
      }

      if (!selection) return
      if (textDraftRef.current) commitText()
      const point = pointFromEvent(event)
      if (!pointInRect(point, selection)) return

      if (tool === 'text') {
        startText(point)
        return
      }

      let nextDraft: Annotation
      if (tool === 'mosaic') {
        nextDraft = createMosaicDraft(point, mosaicBlock)
      } else if (tool === 'pen') {
        nextDraft = createPenDraft(point, color, thickness)
      } else if (isShapeTool(tool)) {
        nextDraft = createShapeDraft(tool, point, color, thickness)
      } else {
        return
      }

      updateDraft(nextDraft)
      dragRef.current = { kind: 'draw', pointerId: event.pointerId, start: point }
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Pointer capture is best-effort.
      }
    },
    [
      busy,
      color,
      commitText,
      image,
      mosaicBlock,
      phase,
      pointFromEvent,
      selection,
      startText,
      thickness,
      tool,
      updateDraft
    ]
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) {
        if (phase === 'select') setCursor(pointFromEvent(event))
        return
      }
      const point = pointFromEvent(event)

      if (drag.kind === 'select') {
        setSelection(normalizeRect(drag.start, point))
        return
      }

      const current = draftRef.current
      if (!current) return
      const next = withDraftEnd(current, point)
      draftRef.current = next
      setDraft(next)
    },
    [phase, pointFromEvent]
  )

  const handlePointerEnter = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (phase === 'select' && !dragRef.current) setCursor(pointFromEvent(event))
    },
    [phase, pointFromEvent]
  )

  const finishPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, canceled: boolean) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      dragRef.current = null
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // The pointer may already be released.
      }

      if (drag.kind === 'select') {
        if (canceled) {
          setSelection(null)
          return
        }
        const point = pointFromEvent(event)
        const rect = normalizeRect(drag.start, point)
        if (rect.width >= 6 && rect.height >= 6) {
          setSelection(rect)
          setPhase('annotate')
          setToolbarPos(null)
          screenshotBridge.lockDisplay(sessionId, displayId)
        } else {
          setSelection(null)
        }
        return
      }

      const current = draftRef.current
      draftRef.current = null
      setDraft(null)
      if (canceled || !current || !isMeaningfulDraft(current)) return
      updateAnnotations([...annotationsRef.current, current])
      setRedoStack([])
    },
    [displayId, pointFromEvent, sessionId, updateAnnotations]
  )

  const handleTextChange = useCallback((value: string) => {
    const current = textDraftRef.current
    if (!current) return
    const next = { ...current, value }
    textDraftRef.current = next
    setTextDraft(next)
  }, [])

  useEffect(() => {
    if (!textDraft) return
    const area = textareaRef.current
    if (!area) return
    area.focus()
    area.setSelectionRange(area.value.length, area.value.length)
  }, [textDraft?.id])

  useLayoutEffect(() => {
    const area = textareaRef.current
    if (!area || !textDraft || !selection) return
    const availableWidth = Math.max(
      90,
      Math.min(
        selection.x + selection.width - textDraft.point.x - 8,
        viewport.width - textDraft.point.x - 8
      )
    )
    const desiredWidth = measureTextWidth(textDraft.value, textDraft.fontSize) + 14
    area.style.width = `${Math.min(Math.max(desiredWidth, 96), availableWidth)}px`
    area.style.height = 'auto'
    const maxHeight = Math.max(24, selection.y + selection.height - textDraft.point.y - 4)
    area.style.height = `${Math.min(area.scrollHeight + 2, maxHeight)}px`
  }, [textDraft, selection, viewport.width])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target
      const inField =
        target instanceof HTMLElement &&
        Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))

      if (event.key === 'Escape') {
        if (inField) return
        if (textDraftRef.current) {
          event.preventDefault()
          cancelText()
          return
        }
        if (draftRef.current) {
          event.preventDefault()
          draftRef.current = null
          setDraft(null)
          return
        }
        if (busy) return
        event.preventDefault()
        screenshotBridge.cancel(sessionId)
        return
      }

      if (inField) return
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && !event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (modifier && !event.altKey && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (!modifier && !event.altKey && !event.shiftKey && phase === 'annotate') {
        const shortcut = TOOL_KEYS[event.key.toLowerCase()]
        if (shortcut) {
          event.preventDefault()
          changeTool(shortcut)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [busy, cancelText, changeTool, phase, redo, sessionId, undo])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return
    const dpr = window.devicePixelRatio || 1
    const width = Math.max(1, viewport.width)
    const height = Math.max(1, viewport.height)
    const pixelWidth = Math.max(1, Math.round(width * dpr))
    const pixelHeight = Math.max(1, Math.round(height * dpr))
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
    }
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    if (!selection) return

    const clip = clampRect(selection, width, height)
    if (clip.width < 1 || clip.height < 1) return
    ctx.save()
    ctx.beginPath()
    ctx.rect(clip.x, clip.y, clip.width, clip.height)
    ctx.clip()
    drawAnnotations(ctx, draft ? [...annotations, draft] : annotations, {
      image,
      imageScaleX: image.naturalWidth / width,
      imageScaleY: image.naturalHeight / height
    })
    ctx.restore()
  }, [annotations, draft, image, selection, viewport.height, viewport.width])

  useLayoutEffect(() => {
    if (phase !== 'annotate' || !selection) {
      setToolbarPos(null)
      return
    }
    const element = toolbarRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const margin = 12
    const width = Math.min(rect.width, viewport.width - margin * 2)
    const height = rect.height
    let left = selection.x + selection.width / 2 - width / 2
    left = clamp(left, margin, Math.max(margin, viewport.width - width - margin))
    let top = selection.y + selection.height + margin
    if (top + height > viewport.height - margin) {
      top = selection.y - height - margin
    }
    if (top < margin) {
      top = clamp(
        selection.y + selection.height - height - margin,
        margin,
        Math.max(margin, viewport.height - height - margin)
      )
    }
    setToolbarPos((current) =>
      current && Math.abs(current.left - left) < 0.5 && Math.abs(current.top - top) < 0.5
        ? current
        : { left, top }
    )
  }, [
    actionError,
    busy,
    fontSize,
    mosaicBlock,
    phase,
    selection,
    thickness,
    tool,
    viewport.height,
    viewport.width
  ])

  const dimStyles = useMemo(() => dimRects(selection, viewport), [selection, viewport])

  if (loadError) {
    return (
      <div className="shot-fatal">
        <p>{loadError}</p>
        <button
          type="button"
          className="shot-fatal__button shot-ui"
          onClick={() => {
            screenshotBridge.cancel(sessionId)
            window.close()
          }}
        >
          关闭
        </button>
      </div>
    )
  }

  if (!context || !image || !imageUrl) {
    return (
      <div className="shot-loading">
        <LoaderCircle size={22} className="spin" />
        <span>正在准备截图…</span>
      </div>
    )
  }

  const outputWidth = Math.max(
    1,
    Math.round((selection?.width ?? 0) * (image.naturalWidth / Math.max(1, viewport.width)))
  )
  const outputHeight = Math.max(
    1,
    Math.round((selection?.height ?? 0) * (image.naturalHeight / Math.max(1, viewport.height)))
  )

  const selectionStyle: CSSProperties | undefined =
    selection && selection.width >= 1 && selection.height >= 1
      ? {
          left: selection.x,
          top: selection.y,
          width: selection.width,
          height: selection.height
        }
      : undefined

  const sizeChipStyle: CSSProperties | undefined =
    selection && selection.width >= 1 && selection.height >= 1
      ? {
          left: clamp(selection.x, 8, Math.max(8, viewport.width - 150)),
          top:
            selection.y > 34
              ? selection.y - 30
              : Math.min(selection.y + 8, Math.max(8, viewport.height - 30))
        }
      : undefined

  const toolbarStyle: CSSProperties = toolbarPos
    ? { left: toolbarPos.left, top: toolbarPos.top }
    : { left: 0, top: 0, visibility: 'hidden' }

  const textStyle: CSSProperties | undefined = (() => {
    if (!textDraft || !selection) return undefined
    const right = selection.x + selection.width
    return {
      left: textDraft.point.x,
      top: textDraft.point.y,
      width: 120,
      maxWidth: Math.max(90, Math.min(right - textDraft.point.x - 2, viewport.width - textDraft.point.x - 8)),
      color: textDraft.color,
      fontSize: textDraft.fontSize,
      lineHeight: `${textDraft.fontSize * TEXT_LINE_HEIGHT}px`,
      fontFamily: TEXT_FONT_FAMILY
    }
  })()

  return (
    <div
      ref={rootRef}
      className={cn(
        'shot-root',
        phase === 'select' && 'is-selecting',
        phase === 'annotate' && 'is-annotating',
        phase === 'annotate' && tool === 'text' && 'is-text-tool'
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={() => setCursor(null)}
      onPointerUp={(event) => finishPointer(event, false)}
      onPointerCancel={(event) => finishPointer(event, true)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <img className="shot-screen" src={imageUrl} alt="" draggable={false} />

      {dimStyles.map((style, index) => (
        <div key={index} className="shot-dim" style={style} />
      ))}

      <canvas ref={canvasRef} className="shot-annotations" aria-hidden="true" />

      {phase === 'select' && cursor && !selection ? (
        <ScreenshotMagnifier image={image} viewport={viewport} cursor={cursor} />
      ) : null}

      {selectionStyle ? (
        <div
          className={cn('shot-selection', phase === 'annotate' && 'is-locked')}
          style={selectionStyle}
        />
      ) : null}

      {sizeChipStyle ? (
        <div className="shot-size" style={sizeChipStyle}>
          {outputWidth} × {outputHeight}
        </div>
      ) : null}

      {phase === 'select' ? (
        <div className="shot-hint">
          <span>拖动鼠标框选截图区域</span>
          <span className="shot-hint__key">Esc</span>
          <span>取消</span>
        </div>
      ) : null}

      {phase === 'annotate' && selection ? (
        <ScreenshotToolbar
          tool={tool}
          color={color}
          thickness={thickness}
          fontSize={fontSize}
          mosaicBlock={mosaicBlock}
          canUndo={annotations.length > 0}
          canRedo={redoStack.length > 0}
          busy={busy}
          error={actionError}
          toolbarRef={toolbarRef}
          style={toolbarStyle}
          onToolChange={changeTool}
          onColorChange={setColor}
          onThicknessChange={setThickness}
          onFontSizeChange={setFontSize}
          onMosaicBlockChange={setMosaicBlock}
          onUndo={undo}
          onRedo={redo}
          onAction={(action) => {
            void finish(action)
          }}
          onCancel={cancel}
        />
      ) : null}

      {textDraft && textStyle ? (
        <textarea
          key={textDraft.id}
          ref={textareaRef}
          className="shot-text-input shot-ui"
          style={textStyle}
          value={textDraft.value}
          spellCheck={false}
          wrap="off"
          aria-label="输入标注文本"
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => handleTextChange(event.target.value)}
          onBlur={commitText}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              cancelText()
              return
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              event.stopPropagation()
              commitText()
            }
          }}
        />
      ) : null}
    </div>
  )
}
