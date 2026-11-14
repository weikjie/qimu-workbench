/** Shared contracts for the built-in screenshot tool. */

export type ScreenshotTool =
  | 'rectangle'
  | 'line'
  | 'ellipse'
  | 'pen'
  | 'arrow'
  | 'text'
  | 'mosaic'

export interface ScreenshotPoint {
  x: number
  y: number
}

export interface ScreenshotRect {
  x: number
  y: number
  width: number
  height: number
}

/** One frozen display inside a capture session. Coordinates and sizes are CSS
 * pixels (the same units Electron's screen API uses), while `imageWidth` and
 * `imageHeight` describe the actual pixels of the frozen bitmap. */
export interface ScreenshotDisplayInfo {
  id: number
  width: number
  height: number
  scaleFactor: number
  bounds: ScreenshotRect
  imageWidth: number
  imageHeight: number
}

export interface ScreenshotSessionInfo {
  id: string
  displays: ScreenshotDisplayInfo[]
  /** The display under the pointer when the shortcut was pressed. */
  activeDisplayId: number
}

/** Everything one overlay window needs before it can draw its frozen screen. */
export interface ScreenshotOverlayContext {
  session: ScreenshotSessionInfo
  display: ScreenshotDisplayInfo
  /** PNG bytes of the frozen screen for this display, at its native scale. */
  png: ArrayBuffer
}

export type ScreenshotAction = 'copy' | 'save' | 'pin'

export interface ScreenshotFinishInput {
  sessionId: string
  displayId: number
  action: ScreenshotAction
  /** PNG bytes of the cropped, annotated selection. */
  png: ArrayBuffer
  /** Selection in CSS pixels relative to the display. */
  selection: ScreenshotRect
}

export interface ScreenshotActionResult {
  ok: boolean
  message?: string
  /** True when the user dismissed the native save dialog. */
  canceled?: boolean
  filePath?: string
}

/** Data handed to a pinned (always-on-top) image window. */
export interface ScreenshotPinContext {
  id: string
  /** CSS pixel size of the pinned image. */
  width: number
  height: number
  /** Current zoom relative to the captured selection. */
  scale: number
  png: ArrayBuffer
}

export type ScreenshotPinAction = 'copy' | 'save' | 'close'

export interface ScreenshotPinActionInput {
  id: string
  action: ScreenshotPinAction
}

export interface ScreenshotPinActionResult {
  ok: boolean
  message?: string
  canceled?: boolean
  filePath?: string
}

export interface ScreenshotPinZoomInput {
  id: string
  scale: number
}

export interface ScreenshotPinMoveInput {
  id: string
  x: number
  y: number
}

export interface ScreenshotPinZoomResult {
  ok: boolean
  scale?: number
  width?: number
  height?: number
  message?: string
}
