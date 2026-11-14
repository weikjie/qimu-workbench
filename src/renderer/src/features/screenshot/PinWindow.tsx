import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Download, LoaderCircle, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { screenshotBridge } from '../../services/desktop'

interface PinWindowProps {
  pinId: string
}

type PinBusy = 'copy' | 'save' | null

interface Feedback {
  message: string
  tone: 'ok' | 'error'
}

interface PinDragState {
  pointerId: number
  startScreenX: number
  startScreenY: number
  startWindowX: number
  startWindowY: number
  lastX: number
  lastY: number
}

export function PinWindow({ pinId }: PinWindowProps): React.JSX.Element {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<PinBusy>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [scale, setScale] = useState(1)
  const [dragging, setDragging] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const imageUrlRef = useRef<string | null>(null)
  const feedbackTimer = useRef<number | null>(null)
  const dragRef = useRef<PinDragState | null>(null)
  const scaleRef = useRef(1)

  const showFeedback = useCallback((message: string, tone: Feedback['tone']) => {
    setFeedback({ message, tone })
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current)
    feedbackTimer.current = window.setTimeout(() => {
      setFeedback(null)
      feedbackTimer.current = null
    }, 2200)
  }, [])

  useEffect(() => {
    document.title = '栖木截图'
    let disposed = false
    screenshotBridge
      .getPinContext(pinId)
      .then((data) => {
        if (disposed) return
        if (!data) {
          setLoadError('贴图已关闭。')
          return
        }
        scaleRef.current = data.scale
        setScale(data.scale)
        const url = URL.createObjectURL(new Blob([data.png], { type: 'image/png' }))
        imageUrlRef.current = url
        setImageUrl(url)
      })
      .catch((error: unknown) => {
        if (disposed) return
        console.error('[screenshot] could not load pinned image:', error)
        setLoadError('无法读取贴图。')
      })

    return () => {
      disposed = true
    }
  }, [pinId])

  useEffect(() => {
    return () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current)
        imageUrlRef.current = null
      }
      if (feedbackTimer.current !== null) {
        window.clearTimeout(feedbackTimer.current)
      }
    }
  }, [])

  const close = useCallback(() => {
    void screenshotBridge.pinAction({ id: pinId, action: 'close' })
  }, [pinId])

  const copy = useCallback(async () => {
    if (busy) return
    setBusy('copy')
    try {
      const result = await screenshotBridge.pinAction({ id: pinId, action: 'copy' })
      if (result.ok) showFeedback('已复制到剪贴板', 'ok')
      else showFeedback(result.message ?? '复制失败', 'error')
    } catch (error) {
      console.error('[screenshot] could not copy pinned image:', error)
      showFeedback('复制失败', 'error')
    } finally {
      setBusy(null)
    }
  }, [busy, pinId, showFeedback])

  const save = useCallback(async () => {
    if (busy) return
    setBusy('save')
    try {
      const result = await screenshotBridge.pinAction({ id: pinId, action: 'save' })
      if (result.ok) showFeedback('截图已保存', 'ok')
      else if (!result.canceled) showFeedback(result.message ?? '保存失败', 'error')
    } catch (error) {
      console.error('[screenshot] could not save pinned image:', error)
      showFeedback('保存失败', 'error')
    } finally {
      setBusy(null)
    }
  }, [busy, pinId, showFeedback])

  useEffect(() => {
    const element = rootRef.current
    if (!element || !imageUrl) return
    let pendingScale = scaleRef.current
    let timer: number | null = null
    const applyScale = (): void => {
      timer = null
      void screenshotBridge
        .pinZoom({ id: pinId, scale: pendingScale })
        .then((result) => {
          if (result.ok && typeof result.scale === 'number') {
            scaleRef.current = result.scale
            setScale(result.scale)
          }
        })
        .catch((error: unknown) => {
          console.error('[screenshot] could not zoom pinned image:', error)
        })
    }
    const handleWheel = (event: WheelEvent): void => {
      event.preventDefault()
      pendingScale = Math.min(4, Math.max(0.2, pendingScale * Math.exp(-event.deltaY * 0.0015)))
      // Throttle instead of debouncing so continuous scrolling keeps resizing.
      if (timer === null) timer = window.setTimeout(applyScale, 50)
    }
    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      element.removeEventListener('wheel', handleWheel)
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [imageUrl, pinId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        void copy()
        return
      }
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [close, copy, save])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      const target = event.target
      // Icons inside the buttons are SVG elements, so check against Element
      // rather than HTMLElement; otherwise pointer capture steals the click.
      if (target instanceof Element && target.closest('.pin-actions')) return
      dragRef.current = {
        pointerId: event.pointerId,
        startScreenX: event.screenX,
        startScreenY: event.screenY,
        startWindowX: window.screenX,
        startWindowY: window.screenY,
        lastX: Math.round(window.screenX),
        lastY: Math.round(window.screenY)
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Pointer capture is best-effort.
      }
      setDragging(true)
    },
    []
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const nextX = Math.round(drag.startWindowX + event.screenX - drag.startScreenX)
      const nextY = Math.round(drag.startWindowY + event.screenY - drag.startScreenY)
      if (nextX === drag.lastX && nextY === drag.lastY) return
      drag.lastX = nextX
      drag.lastY = nextY
      screenshotBridge.pinMove({ id: pinId, x: nextX, y: nextY })
    },
    [pinId]
  )

  const endPointerDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // The pointer may already be released.
    }
  }, [])

  if (loadError) {
    return (
      <div className="pin-root pin-root--error">
        <p>{loadError}</p>
        <button type="button" className="pin-error__close shot-ui" onClick={() => window.close()}>
          关闭
        </button>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className={cn('pin-root', dragging && 'is-dragging')}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointerDrag}
      onPointerCancel={endPointerDrag}
    >
      {imageUrl ? (
        <img className="pin-image" src={imageUrl} alt="桌面贴图" draggable={false} />
      ) : (
        <div className="pin-loading">
          <LoaderCircle size={18} className="spin" />
        </div>
      )}

      <div className="pin-actions shot-ui">
        <button
          type="button"
          className="pin-action"
          title="复制到剪贴板（Ctrl+C）"
          aria-label="复制到剪贴板"
          disabled={busy !== null}
          onClick={() => void copy()}
        >
          {busy === 'copy' ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <Copy size={14} strokeWidth={1.9} />
          )}
        </button>
        <button
          type="button"
          className="pin-action"
          title="保存到本地（Ctrl+S）"
          aria-label="保存到本地"
          disabled={busy !== null}
          onClick={() => void save()}
        >
          {busy === 'save' ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <Download size={14} strokeWidth={1.9} />
          )}
        </button>
        <button
          type="button"
          className="pin-action pin-action--close"
          title="关闭贴图（Esc）"
          aria-label="关闭贴图"
          onClick={close}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      <span className="pin-scale">{Math.round(scale * 100)}%</span>

      {feedback ? (
        <div className={cn('pin-feedback', `pin-feedback--${feedback.tone}`)} role="status">
          {feedback.tone === 'ok' ? <Check size={13} /> : null}
          {feedback.message}
        </div>
      ) : null}
    </div>
  )
}
