import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type { QuickLink } from '@shared/types'
import { edgeScrollDelta, findScrollContainer } from '../../lib/drag'

export type LinkDropPosition = 'before' | 'after'

export interface LinkDropTarget {
  /** The card to insert near, or `null` when dropping onto the group itself. */
  linkId: string | null
  groupId: string | null
  position: LinkDropPosition
}

/** Where the dragged card currently sits while the pointer moves. */
export interface LinkLivePreview {
  groupId: string | null
  index: number
}

export type LinkDropResult =
  | { kind: 'card'; linkId: string | null; groupId: string | null; position: LinkDropPosition }
  | { kind: 'live'; groupId: string | null; index: number }

export interface LinkDragPreview {
  link: QuickLink
  width: number
  height: number
}

interface SlotCenter {
  x: number
  y: number
}

interface DragSession {
  link: QuickLink
  pointerId: number
  pointerType: string
  startX: number
  startY: number
  offsetX: number
  offsetY: number
  lastX: number
  lastY: number
  rect: DOMRect
  groupId: string | null
  sourceIndex: number
  grid: HTMLElement | null
  slots: SlotCenter[]
  scroller: HTMLElement | null
  active: boolean
}

export interface LinkDragController {
  draggingId: string | null
  livePreview: LinkLivePreview | null
  dropTarget: LinkDropTarget | null
  preview: LinkDragPreview | null
  previewRef: React.RefObject<HTMLDivElement | null>
  /** Starts a press; moving `DRAG_START_PX` away begins the drag. */
  beginPress: (event: ReactPointerEvent<HTMLElement>, link: QuickLink) => void
  /** True right after a drag, so the release does not also open the link. */
  justDragged: () => boolean
}

const DRAG_START_PX = 6
const TOUCH_DRAG_START_PX = 10
const CLICK_SUPPRESS_MS = 320
const EDGE_SCROLL_PX = 68
const EDGE_SCROLL_STEP = 16

function sameTarget(a: LinkDropTarget | null, b: LinkDropTarget | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.linkId === b.linkId && a.groupId === b.groupId && a.position === b.position
}

function sameLivePreview(a: LinkLivePreview | null, b: LinkLivePreview | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.groupId === b.groupId && a.index === b.index
}

function datasetGroup(element: HTMLElement): string | null {
  return element.dataset.linkGroup ? element.dataset.linkGroup : null
}

/**
 * Maps the pointer to a grid slot captured when the drag started. The slots
 * are fixed for the duration of a same-group drag, so the placeholder cannot
 * chase itself.
 */
function nearestSlotIndex(slots: readonly SlotCenter[], x: number, y: number): number {
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index]
    const dx = x - slot.x
    const dy = y - slot.y
    const distance = dx * dx + dy * dy
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  }
  return best
}

/** Target card inside a group other than the dragged card's own group. */
function resolveCardTarget(
  section: HTMLElement,
  groupId: string | null,
  movingId: string,
  x: number,
  y: number
): LinkDropTarget {
  const candidates = Array.from(
    section.querySelectorAll<HTMLElement>('[data-link-card]')
  ).flatMap((card) => {
    const id = card.dataset.linkCard
    if (!id || id === movingId) return []
    return [{ id, rect: card.getBoundingClientRect() }]
  })

  if (candidates.length === 0) {
    return { linkId: null, groupId, position: 'after' }
  }

  let nearest = candidates[0]
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const distance = Math.hypot(
      x - (candidate.rect.left + candidate.rect.width / 2),
      y - (candidate.rect.top + candidate.rect.height / 2)
    )
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = candidate
    }
  }

  return {
    linkId: nearest.id,
    groupId,
    position: y < nearest.rect.top + nearest.rect.height / 2 ? 'before' : 'after'
  }
}

/**
 * Press-and-move card sorting. Crossing `DRAG_START_PX` lifts the card, a
 * placeholder moves between the static grid slots, and the remaining cards
 * are animated into their new positions by the view (FLIP).
 */
export function useLinkDrag(
  onDrop: (link: QuickLink, result: LinkDropResult) => void
): LinkDragController {
  const [preview, setPreview] = useState<LinkDragPreview | null>(null)
  const [livePreview, setLivePreview] = useState<LinkLivePreview | null>(null)
  const [dropTarget, setDropTarget] = useState<LinkDropTarget | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const sessionRef = useRef<DragSession | null>(null)
  const liveRef = useRef<LinkLivePreview | null>(null)
  const liveActiveRef = useRef(false)
  const targetRef = useRef<LinkDropTarget | null>(null)
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
    document.body.classList.remove('is-link-dragging')

    const live = liveRef.current
    const liveActive = liveActiveRef.current
    const target = targetRef.current
    liveRef.current = null
    liveActiveRef.current = false
    targetRef.current = null
    setPreview(null)
    setLivePreview(null)
    setDropTarget(null)

    if (session.active) {
      // A real drag swallows the click that follows the release.
      suppressClickUntil.current = Date.now() + CLICK_SUPPRESS_MS
      if (!commit) return
      if (target) onDropRef.current(session.link, { kind: 'card', ...target })
      else if (liveActive && live) onDropRef.current(session.link, { kind: 'live', ...live })
    }
  }, [])

  const beginPress = useCallback<LinkDragController['beginPress']>((event, link) => {
    if (event.button !== 0 || sessionRef.current) return
    if ((event.target as HTMLElement).closest('[data-no-drag]')) return

    const card = event.currentTarget
    const rect = card.getBoundingClientRect()
    const session: DragSession = {
      link,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      lastX: event.clientX,
      lastY: event.clientY,
      rect,
      groupId: null,
      sourceIndex: 0,
      grid: null,
      slots: [],
      scroller: findScrollContainer(card),
      active: false
    }
    sessionRef.current = session
    let scrollFrame: number | null = null

    const updateDragState = (x: number, y: number): void => {
      const element = document.elementFromPoint(x, y)
      const section =
        element instanceof HTMLElement
          ? element.closest<HTMLElement>('section[data-link-group]')
          : null

      if (section && datasetGroup(section) === session.groupId && session.grid) {
        liveActiveRef.current = true
        const gridBox = session.grid.getBoundingClientRect()
        const nextLive: LinkLivePreview = {
          groupId: session.groupId,
          index: nearestSlotIndex(session.slots, x - gridBox.left, y - gridBox.top)
        }
        if (!sameLivePreview(liveRef.current, nextLive)) {
          liveRef.current = nextLive
          setLivePreview(nextLive)
        }
        if (targetRef.current !== null) {
          targetRef.current = null
          setDropTarget(null)
        }
        return
      }

      // Keep the source placeholder where it is while the pointer is over
      // another group; only its validity for a same-group drop changes.
      liveActiveRef.current = false

      if (!section) {
        if (targetRef.current !== null) {
          targetRef.current = null
          setDropTarget(null)
        }
        return
      }

      const nextTarget = resolveCardTarget(
        section,
        datasetGroup(section),
        session.link.id,
        x,
        y
      )
      if (!sameTarget(targetRef.current, nextTarget)) {
        targetRef.current = nextTarget
        setDropTarget(nextTarget)
      }
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
      const section = card.closest<HTMLElement>('section[data-link-group]')
      if (!section) {
        stop(false)
        return
      }

      session.active = true
      // Disable hover lift before measuring, so slot boxes are true layout
      // positions rather than boxes shifted by the pointer's hover state.
      document.body.classList.add('is-link-dragging')
      window.getSelection()?.removeAllRanges()
      suppressClickUntil.current = Date.now() + CLICK_SUPPRESS_MS

      const cards = Array.from(section.querySelectorAll<HTMLElement>('[data-link-card]'))
      session.groupId = datasetGroup(section)
      session.sourceIndex = Math.max(
        0,
        cards.findIndex((element) => element.dataset.linkCard === link.id)
      )
      session.grid = section.querySelector<HTMLElement>('.link-grid')
      if (session.grid) {
        const gridBox = session.grid.getBoundingClientRect()
        session.slots = cards.map((element) => {
          const box = element.getBoundingClientRect()
          return {
            x: box.left + box.width / 2 - gridBox.left,
            y: box.top + box.height / 2 - gridBox.top
          }
        })
      } else {
        session.slots = []
      }

      const initialLive: LinkLivePreview = {
        groupId: session.groupId,
        index: session.sourceIndex
      }
      liveRef.current = initialLive
      liveActiveRef.current = true
      setLivePreview(initialLive)
      setPreview({
        link: session.link,
        width: Math.round(rect.width),
        height: Math.round(rect.height)
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

    // Wheel scrolling moves the grid under a stationary pointer.
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
      document.body.classList.remove('is-link-dragging')
    }
  }, [])

  const justDragged = useCallback((): boolean => Date.now() < suppressClickUntil.current, [])

  return {
    draggingId: preview?.link.id ?? null,
    livePreview,
    dropTarget,
    preview,
    previewRef,
    beginPress,
    justDragged
  }
}
