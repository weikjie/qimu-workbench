import { useLayoutEffect, useRef } from 'react'

interface StoredPosition {
  x: number
  y: number
  container: HTMLElement
}

/**
 * FLIP animation for lists whose order changes between renders.
 *
 * Elements opt in with a stable `data-flip-id`. Positions are measured
 * relative to the closest ancestor matching `containerSelector`, so page
 * scrolling, section reflow and ancestor animations do not skew the deltas.
 */
export function useFlipLayout(containerSelector: string, duration = 200): void {
  const positions = useRef(new Map<string, StoredPosition>())
  const animations = useRef(new WeakMap<HTMLElement, Animation>())

  useLayoutEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-flip-id]'))

    // Reset running layout transitions before measuring.
    for (const element of elements) {
      animations.current.get(element)?.cancel()
      animations.current.delete(element)
    }

    const containerBoxes = new Map<HTMLElement, DOMRect>()
    const nextPositions = new Map<string, StoredPosition>()
    for (const element of elements) {
      const id = element.dataset.flipId
      if (!id) continue
      const container = element.closest<HTMLElement>(containerSelector)
      if (!container) continue

      let containerBox = containerBoxes.get(container)
      if (!containerBox) {
        containerBox = container.getBoundingClientRect()
        containerBoxes.set(container, containerBox)
      }

      const box = element.getBoundingClientRect()
      const position = {
        x: box.left - containerBox.left,
        y: box.top - containerBox.top,
        container
      }
      nextPositions.set(id, position)

      const previous = positions.current.get(id)
      // An item that changed containers (e.g. moved to another list) should
      // not animate from coordinates measured in the old container.
      if (!previous || previous.container !== container) continue
      const dx = previous.x - position.x
      const dy = previous.y - position.y
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue

      const animation = element.animate(
        [
          { transform: `translate3d(${dx}px, ${dy}px, 0)` },
          { transform: 'translate3d(0px, 0px, 0)' }
        ],
        { duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      )
      animations.current.set(element, animation)
      animation.finished
        .then(() => {
          if (animations.current.get(element) === animation) {
            animations.current.delete(element)
          }
        })
        .catch(() => undefined)
    }
    positions.current = nextPositions
  })
}
