/** Finds the nearest vertically scrollable ancestor of the dragged element. */
export function findScrollContainer(element: HTMLElement | null): HTMLElement | null {
  let node = element?.parentElement ?? null
  while (node) {
    const styles = window.getComputedStyle(node)
    if (/(auto|scroll)/.test(styles.overflowY) && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }
  return null
}

/** Scroll delta for a pointer held near the top or bottom edge of a container. */
export function edgeScrollDelta(
  scroller: HTMLElement,
  pointerY: number,
  edgePx: number,
  maxStep: number
): number {
  const box = scroller.getBoundingClientRect()
  if (pointerY < box.top + edgePx) {
    return -Math.ceil(((box.top + edgePx - pointerY) / edgePx) * maxStep)
  }
  if (pointerY > box.bottom - edgePx) {
    return Math.ceil(((pointerY - (box.bottom - edgePx)) / edgePx) * maxStep)
  }
  return 0
}
