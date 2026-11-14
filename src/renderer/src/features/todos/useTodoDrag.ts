import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { isTodoPriority, type TodoPriority } from '@shared/priorities'
import type { Todo } from '@shared/types'
import { edgeScrollDelta, findScrollContainer } from '../../lib/drag'

export interface TodoLivePreview {
  priority: TodoPriority
  index: number
}

export interface TodoDragPreview {
  todo: Todo
  width: number
  height: number
}

export interface TodoDropResult {
  priority: TodoPriority
  index: number
}

export interface TodoDragController {
  draggingId: string | null
  livePreview: TodoLivePreview | null
  preview: TodoDragPreview | null
  previewRef: React.RefObject<HTMLDivElement | null>
  /** Starts a press; moving `DRAG_START_PX` away begins the drag. */
  beginPress: (event: ReactPointerEvent<HTMLElement>, todo: Todo) => void
  /** True right after a drag, so the release does not also toggle the todo. */
  justDragged: () => boolean
}

interface DragSession {
  todo: Todo
  pointerId: number
  pointerType: string
  startX: number
  startY: number
  offsetX: number
  offsetY: number
  lastX: number
  lastY: number
  rect: DOMRect
  list: HTMLElement
  scroller: HTMLElement | null
  active: boolean
}

const DRAG_START_PX = 6
const TOUCH_DRAG_START_PX = 10
const CLICK_SUPPRESS_MS = 320
const EDGE_SCROLL_PX = 68
const EDGE_SCROLL_STEP = 16

function sameLivePreview(a: TodoLivePreview | null, b: TodoLivePreview | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.priority === b.priority && a.index === b.index
}

function priorityFromList(list: HTMLElement): TodoPriority | null {
  const group = list.closest<HTMLElement>('section[data-priority]')
  const value = group?.dataset.priority
  return value && isTodoPriority(value) ? value : null
}

/**
 * Counts how many other rows sit above the pointer. The list is vertical and
 * rows can have different heights, so live midpoints are used instead of the
 * fixed grid slots that the quick-link cards use.
 */
function insertionIndexFromRows(list: HTMLElement, movingId: string, pointerY: number): number {
  let index = 0
  for (const row of list.querySelectorAll<HTMLElement>('[data-todo-row]')) {
    if (row.dataset.todoRow === movingId) continue
    const box = row.getBoundingClientRect()
    if (pointerY > box.top + box.height / 2) index += 1
  }
  return index
}

/**
 * Press-and-move sorting for the todo list. The dragged row is replaced by a
 * placeholder in its priority group; the other rows move between renders and
 * are animated by the view (FLIP). Reordering stays inside the same priority.
 */
export function useTodoDrag(
  onDrop: (todo: Todo, result: TodoDropResult) => void
): TodoDragController {
  const [preview, setPreview] = useState<TodoDragPreview | null>(null)
  const [livePreview, setLivePreview] = useState<TodoLivePreview | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const sessionRef = useRef<DragSession | null>(null)
  const liveRef = useRef<TodoLivePreview | null>(null)
  const liveActiveRef = useRef(false)
  const cleanupRef = useRef<(() => void) | null>(null)
  const suppressClickUntil = useRef(0)
  const onDropRef = useRef(onDrop)

  onDropRef.current = onDrop

  const placePreview = useCallback((session: DragSession): void => {
    const node = previewRef.current
    if (!node) return
    node.style.transform = `translate3d(${Math.round(session.lastX - session.offsetX)}px, ${Math.round(
      session.lastY - session.offsetY
    )}px, 0)`
  }, [])

  const stop = useCallback((commit: boolean): void => {
    const session = sessionRef.current
    if (!session) return
    cleanupRef.current?.()
    cleanupRef.current = null
    sessionRef.current = null
    document.body.classList.remove('is-todo-dragging')

    const live = liveRef.current
    const liveActive = liveActiveRef.current
    liveRef.current = null
    liveActiveRef.current = false
    setPreview(null)
    setLivePreview(null)

    if (session.active) {
      // A real drag swallows the click that follows the release.
      suppressClickUntil.current = Date.now() + CLICK_SUPPRESS_MS
      if (commit && liveActive && live) onDropRef.current(session.todo, live)
    }
  }, [])

  const beginPress = useCallback<TodoDragController['beginPress']>((event, todo) => {
    if (event.button !== 0 || sessionRef.current) return

    // The title area (a button that toggles the todo) may start a drag; the
    // checkbox, priority select and row actions keep their own behavior.
    const target = event.target as HTMLElement
    const body = target.closest('.todo-item__body')
    if (!body && target.closest('button, input, select, textarea, a, [data-no-drag]')) return

    const row = event.currentTarget
    const list = row.closest<HTMLElement>('.todo-list')
    if (!list) return

    const rect = row.getBoundingClientRect()
    const session: DragSession = {
      todo,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      lastX: event.clientX,
      lastY: event.clientY,
      rect,
      list,
      scroller: findScrollContainer(row),
      active: false
    }
    sessionRef.current = session
    let scrollFrame: number | null = null

    const updateDragState = (x: number, y: number): void => {
      const element = document.elementFromPoint(x, y)
      const hoveredList =
        element instanceof HTMLElement ? element.closest<HTMLElement>('.todo-list') : null

      if (
        hoveredList === session.list &&
        priorityFromList(hoveredList) === session.todo.priority
      ) {
        liveActiveRef.current = true
        const index = insertionIndexFromRows(session.list, session.todo.id, y)
        const nextLive: TodoLivePreview = { priority: session.todo.priority, index }
        if (!sameLivePreview(liveRef.current, nextLive)) {
          liveRef.current = nextLive
          setLivePreview(nextLive)
        }
        return
      }

      // Keep the gap where it is while the pointer is outside the group; the
      // drop simply becomes a no-op.
      liveActiveRef.current = false
    }

    const scrollStep = (): void => {
      scrollFrame = null
      if (!session.scroller || !session.active) return

      const delta = edgeScrollDelta(
        session.scroller,
        session.lastY,
        EDGE_SCROLL_PX,
        EDGE_SCROLL_STEP
      )
      if (delta !== 0) {
        const before = session.scroller.scrollTop
        session.scroller.scrollTop = before + delta
        if (session.scroller.scrollTop !== before) updateDragState(session.lastX, session.lastY)
      }
      scrollFrame = window.requestAnimationFrame(scrollStep)
    }

    const activate = (): void => {
      if (sessionRef.current !== session || session.active) return
      if (!session.list.isConnected) {
        stop(false)
        return
      }

      session.active = true
      document.body.classList.add('is-todo-dragging')
      window.getSelection()?.removeAllRanges()
      suppressClickUntil.current = Date.now() + CLICK_SUPPRESS_MS

      const rows = Array.from(session.list.querySelectorAll<HTMLElement>('[data-todo-row]'))
      const sourceIndex = Math.max(
        0,
        rows.findIndex((element) => element.dataset.todoRow === todo.id)
      )
      const initialLive: TodoLivePreview = {
        priority: todo.priority,
        index: sourceIndex
      }
      liveRef.current = initialLive
      liveActiveRef.current = true
      setLivePreview(initialLive)

      const activeRect = row.getBoundingClientRect()
      setPreview({
        todo,
        width: Math.round(activeRect.width),
        height: Math.round(activeRect.height)
      })
      if (session.scroller) scrollFrame = window.requestAnimationFrame(scrollStep)
    }

    const handleMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== session.pointerId) return
      session.lastX = moveEvent.clientX
      session.lastY = moveEvent.clientY

      if (!session.active) {
        const travelled = Math.hypot(
          moveEvent.clientX - session.startX,
          moveEvent.clientY - session.startY
        )
        const threshold = session.pointerType === 'touch' ? TOUCH_DRAG_START_PX : DRAG_START_PX
        if (travelled < threshold) return
        activate()
        if (!session.active) return
      }

      placePreview(session)
      updateDragState(session.lastX, session.lastY)
    }

    const handleUp = (upEvent: PointerEvent): void => {
      if (upEvent.pointerId !== session.pointerId) return
      session.lastX = upEvent.clientX
      session.lastY = upEvent.clientY
      if (session.active) updateDragState(session.lastX, session.lastY)
      stop(true)
    }

    const handleCancel = (cancelEvent: PointerEvent): void => {
      if (cancelEvent.pointerId !== session.pointerId) return
      stop(false)
    }

    const handleKeyDown = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key !== 'Escape') return
      keyEvent.preventDefault()
      stop(false)
    }

    const handleBlur = (): void => stop(false)

    // Wheel scrolling moves the rows under a stationary pointer.
    const handleScroll = (): void => {
      if (session.active) updateDragState(session.lastX, session.lastY)
    }

    const cleanup = (): void => {
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame)
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleCancel)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('scroll', handleScroll, true)
    }

    cleanupRef.current = cleanup
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleCancel)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('scroll', handleScroll, true)
  }, [placePreview, stop])

  // The preview is created after activation; place it at the held position
  // before the browser paints.
  useLayoutEffect(() => {
    const session = sessionRef.current
    if (!preview || !session) return
    placePreview(session)
  }, [placePreview, preview])

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
      document.body.classList.remove('is-todo-dragging')
    }
  }, [])

  const justDragged = useCallback((): boolean => Date.now() < suppressClickUntil.current, [])

  return {
    draggingId: preview?.todo.id ?? null,
    livePreview,
    preview,
    previewRef,
    beginPress,
    justDragged
  }
}
