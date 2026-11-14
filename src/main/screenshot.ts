import {
  app,
  BrowserWindow,
  clipboard,
  ClipboardItem,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  systemPreferences,
  type WebContents
} from 'electron'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { IPC } from '../shared/api'
import type {
  ScreenshotActionResult,
  ScreenshotDisplayInfo,
  ScreenshotPinActionResult,
  ScreenshotPinZoomResult,
  ScreenshotRect,
  ScreenshotSessionInfo
} from '../shared/screenshot'
import type { OpenResult } from '../shared/types'

const PRELOAD_PATH = join(__dirname, '../preload/index.js')
const RENDERER_HTML = join(__dirname, '../renderer/index.html')
const MAX_PNG_BYTES = 128 * 1024 * 1024
const COLOR_VALUE = /^(#[0-9a-fA-F]{6}|rgb\(\d{1,3}, \d{1,3}, \d{1,3}\))$/

interface FrozenDisplay {
  info: ScreenshotDisplayInfo
  png: Buffer
}

interface CaptureSession {
  id: string
  displays: Map<number, FrozenDisplay>
  overlays: Map<number, BrowserWindow>
  activeDisplayId: number
  closing: boolean
}

interface PinWindowRecord {
  id: string
  window: BrowserWindow
  png: Buffer
  baseWidth: number
  baseHeight: number
  scale: number
}

const SHORTCUT_CANDIDATES = [
  { accelerator: 'F1', label: 'F1' },
  {
    accelerator: 'CommandOrControl+Shift+F1',
    label: process.platform === 'darwin' ? '⌘⇧F1' : 'Ctrl+Shift+F1'
  }
] as const

let session: CaptureSession | null = null
let captureInProgress = false
let ipcRegistered = false
let shortcutLabel: string | null = null
const pinWindows = new Map<string, PinWindowRecord>()

function objectOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function stringOf(value: unknown, maxLength = 200): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : null
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function bytesOf(value: unknown): Uint8Array | null {
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  return null
}

function arrayBufferOf(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function toSessionInfo(current: CaptureSession): ScreenshotSessionInfo {
  return {
    id: current.id,
    activeDisplayId: current.activeDisplayId,
    displays: [...current.displays.values()].map((item) => ({ ...item.info }))
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function suggestedFileName(): string {
  const now = new Date()
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `栖木截图-${stamp}.png`
}

function defaultSavePath(): string {
  try {
    return join(app.getPath('pictures'), suggestedFileName())
  } catch {
    return suggestedFileName()
  }
}

function ensurePngExtension(filePath: string): string {
  const extension = extname(filePath)
  if (!extension) return `${filePath}.png`
  if (extension.toLowerCase() === '.png') return filePath
  return `${filePath.slice(0, -extension.length)}.png`
}

/** Electron 44+ replaced `clipboard.writeImage` with the W3C-style API. */
async function writeImageToClipboard(png: Buffer): Promise<void> {
  const bytes = new Uint8Array(png.byteLength)
  bytes.set(png)
  await clipboard.write([
    new ClipboardItem({
      'image/png': new Blob([bytes], { type: 'image/png' })
    })
  ])
}

async function savePngWithDialog(
  parent: BrowserWindow | null,
  png: Buffer
): Promise<ScreenshotActionResult> {
  const options: Electron.SaveDialogOptions = {
    title: '保存截图',
    buttonLabel: '保存',
    defaultPath: defaultSavePath(),
    filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation']
  }

  try {
    const result =
      parent && !parent.isDestroyed()
        ? await dialog.showSaveDialog(parent, options)
        : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true }
    }
    const filePath = ensurePngExtension(result.filePath)
    await writeFile(filePath, png)
    return { ok: true, filePath }
  } catch (error) {
    console.error('[workbench] could not save screenshot:', error)
    return { ok: false, message: '保存截图失败，请稍后重试。' }
  }
}

function loadRendererPage(window: BrowserWindow, query: Record<string, string>): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    const url = new URL(devUrl)
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value)
    }
    void window.loadURL(url.toString())
    return
  }
  void window.loadFile(RENDERER_HTML, { query })
}

function closeSession(target: CaptureSession): void {
  if (target.closing) return
  target.closing = true
  if (session === target) session = null
  for (const overlay of target.overlays.values()) {
    if (!overlay.isDestroyed()) overlay.destroy()
  }
  target.overlays.clear()
  target.displays.clear()
}

function scheduleSessionClose(target: CaptureSession, delay = 40): void {
  setTimeout(() => closeSession(target), delay)
}

function requireOverlay(
  sender: WebContents,
  sessionId: string,
  displayId: number
): { current: CaptureSession; overlay: BrowserWindow } | null {
  if (!session || session.id !== sessionId) return null
  const overlay = session.overlays.get(displayId)
  if (!overlay || overlay.webContents !== sender) return null
  return { current: session, overlay }
}

function sessionSender(sender: WebContents, sessionId: string): CaptureSession | null {
  if (!session || session.id !== sessionId) return null
  for (const overlay of session.overlays.values()) {
    if (overlay.webContents === sender) return session
  }
  return null
}

function isOverlaySender(sender: WebContents): boolean {
  if (!session) return false
  for (const overlay of session.overlays.values()) {
    if (!overlay.isDestroyed() && overlay.webContents === sender) return true
  }
  return false
}

function focusActiveOverlay(target: CaptureSession): void {
  const overlay = target.overlays.get(target.activeDisplayId)
  if (!overlay || overlay.isDestroyed()) return
  overlay.show()
  overlay.focus()
  overlay.setAlwaysOnTop(true, 'screen-saver')
}

function createOverlayWindow(target: CaptureSession, frozen: FrozenDisplay): BrowserWindow {
  const { bounds } = frozen.info
  const overlay = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false,
    frame: false,
    // A true fullscreen window (rather than a frameless topmost window) is
    // what makes Windows hide the taskbar so the frozen frame can be selected
    // edge to edge. It also keeps one overlay per physical display.
    fullscreen: true,
    fullscreenable: true,
    transparent: false,
    backgroundColor: '#0d1210',
    // Keeping a resizable style is required for native fullscreen on Windows;
    // resizable:false turns the overlay into an oversized topmost frame that
    // leaves the taskbar visible.
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    enableLargerThanScreen: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false
    }
  })

  overlay.setMenu(null)
  overlay.setAlwaysOnTop(true, 'screen-saver')

  target.overlays.set(frozen.info.id, overlay)
  overlay.webContents.on('render-process-gone', (_event, details) => {
    console.error('[workbench] screenshot renderer gone:', details.reason)
  })

  overlay.on('closed', () => {
    if (target.overlays.get(frozen.info.id) === overlay) {
      target.overlays.delete(frozen.info.id)
    }
    if (!target.closing && target.overlays.size === 0) {
      closeSession(target)
    }
  })

  overlay.once('ready-to-show', () => {
    if (overlay.isDestroyed() || target.closing) return
    if (frozen.info.id === target.activeDisplayId) {
      overlay.show()
      overlay.focus()
    } else {
      overlay.showInactive()
    }
    overlay.setAlwaysOnTop(true, 'screen-saver')
  })

  overlay.webContents.on('did-fail-load', (_event, _code, description) => {
    console.error('[workbench] screenshot overlay failed to load:', description)
  })

  loadRendererPage(overlay, {
    mode: 'shot',
    session: target.id,
    display: String(frozen.info.id)
  })

  return overlay
}

function findPendingSource(
  display: Electron.Display,
  sources: Electron.DesktopCapturerSource[]
): number {
  if (sources.length === 0) return -1

  const label = display.label.trim()
  if (label) {
    const byLabel = sources.findIndex(
      (source) => source.name === label || source.name.includes(label)
    )
    if (byLabel >= 0) return byLabel
  }

  const displayNumber = /(\d+)\s*$/.exec(display.label)?.[1]
  if (displayNumber) {
    const byNumber = sources.findIndex((source) => new RegExp(`(^|\\D)${displayNumber}\\s*$`).test(source.name))
    if (byNumber >= 0) return byNumber
  }

  if (sources.length === 1) return 0

  // Last resort: match the screen whose native aspect ratio is closest to the
  // thumbnail, then prefer the largest remaining bitmap.
  const displayAspect = display.size.width / display.size.height
  let bestIndex = 0
  let bestScore = Number.POSITIVE_INFINITY
  sources.forEach((source, index) => {
    const size = source.thumbnail.getSize()
    if (size.width <= 0 || size.height <= 0) return
    const sourceAspect = size.width / size.height
    const aspectPenalty = Math.abs(sourceAspect - displayAspect) * 1000
    const sizePenalty = -(size.width * size.height) / 1_000_000
    const score = aspectPenalty + sizePenalty
    if (score < bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  return bestIndex
}

async function captureDisplays(): Promise<{
  activeDisplayId: number
  frozen: FrozenDisplay[]
}> {
  if (
    process.platform === 'darwin' &&
    systemPreferences.getMediaAccessStatus('screen') !== 'granted'
  ) {
    throw new Error('需要在“系统设置 → 隐私与安全性 → 屏幕录制”中允许栖木工作台截取屏幕。')
  }

  const displays = screen.getAllDisplays()
  if (displays.length === 0) throw new Error('没有找到可截取的屏幕。')

  const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const maxWidth = Math.max(
    1,
    ...displays.map((display) => Math.round(display.size.width * display.scaleFactor))
  )
  const maxHeight = Math.max(
    1,
    ...displays.map((display) => Math.round(display.size.height * display.scaleFactor))
  )

  const sources = (
    await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: maxWidth, height: maxHeight },
      fetchWindowIcons: false
    })
  ).filter((source) => !source.thumbnail.isEmpty())

  if (sources.length === 0) {
    throw new Error('系统没有返回可用的屏幕画面，请稍后重试。')
  }

  const remaining = [...sources]
  const matched = new Map<number, Electron.DesktopCapturerSource>()

  for (const display of displays) {
    const index = remaining.findIndex((source) => source.display_id === String(display.id))
    if (index >= 0) {
      matched.set(display.id, remaining.splice(index, 1)[0]!)
    }
  }

  for (const display of displays) {
    if (matched.has(display.id)) continue
    const index = findPendingSource(display, remaining)
    if (index >= 0) {
      matched.set(display.id, remaining.splice(index, 1)[0]!)
      console.warn(
        `[workbench] screenshot source for display ${display.id} was matched by fallback.`
      )
    }
  }

  const frozen: FrozenDisplay[] = []
  for (const display of displays) {
    const source = matched.get(display.id)
    if (!source) continue
    const size = source.thumbnail.getSize()
    if (size.width <= 0 || size.height <= 0) continue
    const png = source.thumbnail.toPNG()
    if (png.length === 0) continue
    frozen.push({
      info: {
        id: display.id,
        width: display.size.width,
        height: display.size.height,
        scaleFactor: display.scaleFactor,
        bounds: { ...display.bounds },
        imageWidth: size.width,
        imageHeight: size.height
      },
      png
    })
  }

  if (frozen.length === 0) {
    throw new Error('无法获取屏幕画面，请稍后重试。')
  }

  const activeDisplayId = frozen.some((item) => item.info.id === cursorDisplay.id)
    ? cursorDisplay.id
    : frozen[0]!.info.id

  // The active display is created last so that focus naturally lands on it.
  frozen.sort((a, b) => {
    if (a.info.id === activeDisplayId) return 1
    if (b.info.id === activeDisplayId) return -1
    return 0
  })

  return { activeDisplayId, frozen }
}

/** Starts a capture, or focuses the overlays that are already open. */
export async function startScreenshot(): Promise<OpenResult> {
  if (session) {
    focusActiveOverlay(session)
    return { ok: true }
  }
  if (captureInProgress) return { ok: true }

  captureInProgress = true
  try {
    const { activeDisplayId, frozen } = await captureDisplays()
    const created: CaptureSession = {
      id: randomUUID(),
      displays: new Map(),
      overlays: new Map(),
      activeDisplayId,
      closing: false
    }

    for (const item of frozen) {
      created.displays.set(item.info.id, item)
    }

    session = created
    for (const item of frozen) {
      try {
        createOverlayWindow(created, item)
      } catch (error) {
        console.error('[workbench] could not create screenshot overlay:', error)
      }
    }

    if (created.overlays.size === 0) {
      closeSession(created)
      return { ok: false, message: '无法打开截图窗口，请稍后重试。' }
    }

    setTimeout(() => {
      if (session === created) focusActiveOverlay(created)
    }, 140)

    return { ok: true }
  } catch (error) {
    console.error('[workbench] screenshot capture failed:', error)
    return {
      ok: false,
      message: error instanceof Error ? error.message : '截图失败，请稍后重试。'
    }
  } finally {
    captureInProgress = false
  }
}

/** Entry point for the tray menu and the global shortcut, with native error. */
export async function startScreenshotFromSystem(): Promise<void> {
  const result = await startScreenshot()
  if (!result.ok) {
    dialog.showErrorBox('截图失败', result.message ?? '截图失败，请稍后重试。')
  }
}

function clampSelection(
  selection: ScreenshotRect,
  display: ScreenshotDisplayInfo
): ScreenshotRect | null {
  const left = clamp(selection.x, 0, display.width)
  const top = clamp(selection.y, 0, display.height)
  const right = clamp(selection.x + selection.width, left, display.width)
  const bottom = clamp(selection.y + selection.height, top, display.height)
  const width = right - left
  const height = bottom - top
  if (width < 1 || height < 1) return null
  return { x: left, y: top, width, height }
}

function createPinWindow(
  png: Buffer,
  selection: ScreenshotRect,
  display: ScreenshotDisplayInfo
): BrowserWindow | null {
  const width = Math.max(16, Math.min(Math.round(selection.width), display.bounds.width))
  const height = Math.max(16, Math.min(Math.round(selection.height), display.bounds.height))
  const x = Math.round(
    clamp(
      display.bounds.x + selection.x,
      display.bounds.x,
      display.bounds.x + display.bounds.width - width
    )
  )
  const y = Math.round(
    clamp(
      display.bounds.y + selection.y,
      display.bounds.y,
      display.bounds.y + display.bounds.height - height
    )
  )

  const pinId = randomUUID()
  const pin = new BrowserWindow({
    x,
    y,
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  pin.setMenu(null)
  pin.setAlwaysOnTop(true, 'floating')
  pinWindows.set(pinId, {
    id: pinId,
    window: pin,
    png,
    baseWidth: width,
    baseHeight: height,
    scale: 1
  })

  pin.on('closed', () => {
    pinWindows.delete(pinId)
  })

  pin.once('ready-to-show', () => {
    if (pin.isDestroyed()) return
    pin.setAlwaysOnTop(true, 'floating')
    pin.showInactive()
  })

  loadRendererPage(pin, { mode: 'pin', pin: pinId })
  return pin
}

function zoomPinWindow(pin: PinWindowRecord, requestedScale: number): ScreenshotPinZoomResult {
  const bounds = pin.window.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const availableWidth = Math.max(24, display.workArea.width)
  const availableHeight = Math.max(24, display.workArea.height)
  let nextScale = clamp(
    Number.isFinite(requestedScale) ? requestedScale : pin.scale,
    0.2,
    Math.min(4, availableWidth / pin.baseWidth, availableHeight / pin.baseHeight)
  )
  if (!Number.isFinite(nextScale) || nextScale < 0.2) nextScale = 0.2

  const width = Math.max(16, Math.round(pin.baseWidth * nextScale))
  const height = Math.max(16, Math.round(pin.baseHeight * nextScale))
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const x = Math.round(
    clamp(centerX - width / 2, display.workArea.x, display.workArea.x + display.workArea.width - width)
  )
  const y = Math.round(
    clamp(
      centerY - height / 2,
      display.workArea.y,
      display.workArea.y + display.workArea.height - height
    )
  )

  pin.scale = nextScale
  pin.window.setBounds({ x, y, width, height })
  return { ok: true, scale: nextScale, width, height }
}

async function finishScreenshot(
  sender: WebContents,
  payload: unknown
): Promise<ScreenshotActionResult> {
  const input = objectOf(payload)
  if (!input) return { ok: false, message: '截图数据无效。' }

  const sessionId = stringOf(input['sessionId'], 100)
  const displayId = numberOf(input['displayId'])
  const action = input['action']
  if (
    !sessionId ||
    displayId === null ||
    (action !== 'copy' && action !== 'save' && action !== 'pin')
  ) {
    return { ok: false, message: '截图数据无效。' }
  }

  if (!session || session.id !== sessionId) {
    return { ok: false, message: '截图会话已结束。' }
  }
  const overlay = session.overlays.get(displayId)
  const frozen = session.displays.get(displayId)
  if (!overlay || overlay.webContents !== sender || !frozen) {
    return { ok: false, message: '截图窗口已关闭。' }
  }

  const bytes = bytesOf(input['png'])
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_PNG_BYTES) {
    return { ok: false, message: '截图图片数据无效。' }
  }
  const png = Buffer.from(bytes)
  const image = nativeImage.createFromBuffer(png)
  if (image.isEmpty()) {
    return { ok: false, message: '截图图片数据无效。' }
  }

  if (action === 'copy') {
    try {
      await writeImageToClipboard(png)
    } catch (error) {
      console.error('[workbench] could not copy screenshot to clipboard:', error)
      return { ok: false, message: '复制到剪贴板失败。' }
    }
    scheduleSessionClose(session)
    return { ok: true }
  }

  if (action === 'save') {
    const result = await savePngWithDialog(overlay, png)
    if (result.ok) scheduleSessionClose(session)
    return result
  }

  const rawSelection = objectOf(input['selection'])
  if (!rawSelection) return { ok: false, message: '截图区域无效。' }
  const selection: ScreenshotRect = {
    x: numberOf(rawSelection['x']) ?? Number.NaN,
    y: numberOf(rawSelection['y']) ?? Number.NaN,
    width: numberOf(rawSelection['width']) ?? Number.NaN,
    height: numberOf(rawSelection['height']) ?? Number.NaN
  }
  if (
    !Number.isFinite(selection.x) ||
    !Number.isFinite(selection.y) ||
    !Number.isFinite(selection.width) ||
    !Number.isFinite(selection.height)
  ) {
    return { ok: false, message: '截图区域无效。' }
  }
  const clamped = clampSelection(selection, frozen.info)
  if (!clamped) return { ok: false, message: '截图区域无效。' }

  try {
    const pin = createPinWindow(png, clamped, frozen.info)
    if (!pin) return { ok: false, message: '无法创建贴图窗口。' }
  } catch (error) {
    console.error('[workbench] could not create pinned screenshot:', error)
    return { ok: false, message: '无法创建贴图窗口。' }
  }
  scheduleSessionClose(session)
  return { ok: true }
}

async function pinAction(
  sender: WebContents,
  payload: unknown
): Promise<ScreenshotPinActionResult> {
  const input = objectOf(payload)
  if (!input) return { ok: false, message: '贴图数据无效。' }
  const id = stringOf(input['id'], 100)
  const action = input['action']
  if (!id || (action !== 'copy' && action !== 'save' && action !== 'close')) {
    return { ok: false, message: '贴图数据无效。' }
  }
  const pin = pinWindows.get(id)
  if (!pin || pin.window.webContents !== sender) {
    return { ok: false, message: '贴图窗口已关闭。' }
  }

  if (action === 'close') {
    setTimeout(() => {
      if (!pin.window.isDestroyed()) pin.window.close()
    }, 0)
    return { ok: true }
  }

  const image = nativeImage.createFromBuffer(pin.png)
  if (image.isEmpty()) return { ok: false, message: '贴图图片数据无效。' }

  if (action === 'copy') {
    try {
      await writeImageToClipboard(pin.png)
      return { ok: true }
    } catch (error) {
      console.error('[workbench] could not copy pinned image:', error)
      return { ok: false, message: '复制到剪贴板失败。' }
    }
  }

  return savePngWithDialog(pin.window, pin.png)
}

/** Registers the screenshot IPC handlers. Safe to call once. */
export function registerScreenshotIpc(deps: {
  isMainWindowSender: (sender: WebContents) => boolean
}): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle(IPC.screenshotStart, async (event) => {
    if (!deps.isMainWindowSender(event.sender)) throw new Error('Untrusted sender')
    return startScreenshot()
  })

  ipcMain.handle(IPC.screenshotShortcut, async (event) => {
    if (!deps.isMainWindowSender(event.sender)) throw new Error('Untrusted sender')
    return getScreenshotShortcutLabel()
  })

  ipcMain.handle(IPC.screenshotOverlayContext, async (event, payload) => {
    const input = objectOf(payload)
    const sessionId = stringOf(input?.['sessionId'], 100)
    const displayId = numberOf(input?.['displayId'])
    if (!sessionId || displayId === null) return null
    const current = requireOverlay(event.sender, sessionId, displayId)
    if (!current) return null
    const frozen = current.current.displays.get(displayId)
    if (!frozen) return null
    return {
      session: toSessionInfo(current.current),
      display: { ...frozen.info },
      png: arrayBufferOf(frozen.png)
    }
  })

  ipcMain.on(IPC.screenshotLockDisplay, (event, payload) => {
    const input = objectOf(payload)
    const sessionId = stringOf(input?.['sessionId'], 100)
    const displayId = numberOf(input?.['displayId'])
    if (!sessionId || displayId === null) return
    if (!requireOverlay(event.sender, sessionId, displayId)) return
    if (!session) return
    for (const [id, overlay] of session.overlays) {
      if (id === displayId) continue
      if (!overlay.isDestroyed()) overlay.destroy()
    }
  })

  ipcMain.handle(IPC.screenshotFinish, async (event, payload) => {
    return finishScreenshot(event.sender, payload)
  })

  ipcMain.on(IPC.screenshotCancel, (event, payload) => {
    const input = objectOf(payload)
    const sessionId = stringOf(input?.['sessionId'], 100)
    if (!sessionId) return
    const current = sessionSender(event.sender, sessionId)
    if (!current) return
    closeSession(current)
  })

  ipcMain.handle(IPC.screenshotCopyText, async (event, payload) => {
    if (!isOverlaySender(event.sender)) return { ok: false, message: '截图窗口已关闭。' }
    const input = objectOf(payload)
    const text = stringOf(input?.['text'], 64)
    if (!text || !COLOR_VALUE.test(text)) return { ok: false, message: '色值无效。' }
    try {
      await clipboard.writeText(text)
      return { ok: true }
    } catch (error) {
      console.warn('[workbench] could not copy screenshot color:', error)
      return { ok: false, message: '无法写入剪贴板。' }
    }
  })

  ipcMain.handle(IPC.screenshotPinContext, async (event, payload) => {
    const input = objectOf(payload)
    const id = stringOf(input?.['id'], 100)
    if (!id) return null
    const pin = pinWindows.get(id)
    if (!pin || pin.window.webContents !== event.sender) return null
    return {
      id,
      width: pin.baseWidth,
      height: pin.baseHeight,
      scale: pin.scale,
      png: arrayBufferOf(pin.png)
    }
  })

  ipcMain.handle(IPC.screenshotPinAction, async (event, payload) => {
    return pinAction(event.sender, payload)
  })

  ipcMain.handle(IPC.screenshotPinZoom, async (event, payload) => {
    const input = objectOf(payload)
    if (!input) return { ok: false, message: '贴图数据无效。' }
    const id = stringOf(input['id'], 100)
    const scale = numberOf(input['scale'])
    if (!id || scale === null) return { ok: false, message: '贴图数据无效。' }
    const pin = pinWindows.get(id)
    if (!pin || pin.window.webContents !== event.sender) {
      return { ok: false, message: '贴图窗口已关闭。' }
    }
    return zoomPinWindow(pin, scale)
  })

  ipcMain.on(IPC.screenshotPinMove, (event, payload) => {
    const input = objectOf(payload)
    const id = stringOf(input?.['id'], 100)
    const x = numberOf(input?.['x'])
    const y = numberOf(input?.['y'])
    if (!id || x === null || y === null) return
    const pin = pinWindows.get(id)
    if (!pin || pin.window.webContents !== event.sender || pin.window.isDestroyed()) return

    const displays = screen.getAllDisplays()
    const bounds = pin.window.getBounds()
    const minX = Math.min(...displays.map((display) => display.bounds.x))
    const minY = Math.min(...displays.map((display) => display.bounds.y))
    const maxX = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width))
    const maxY = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height))
    const nextX = Math.round(clamp(x, minX, Math.max(minX, maxX - bounds.width)))
    const nextY = Math.round(clamp(y, minY, Math.max(minY, maxY - bounds.height)))
    pin.window.setPosition(nextX, nextY)
  })
}

/** Registers F1 (or the first available fallback) for screen capture. */
export function registerScreenshotShortcut(): string | null {
  for (const candidate of SHORTCUT_CANDIDATES) {
    try {
      const registered = globalShortcut.register(candidate.accelerator, () => {
        void startScreenshotFromSystem()
      })
      if (registered) {
        shortcutLabel = candidate.label
        console.info(`[workbench] screenshot shortcut: ${candidate.label}`)
        return shortcutLabel
      }
    } catch (error) {
      console.warn(`[workbench] screenshot shortcut ${candidate.label} failed:`, error)
    }
  }

  console.warn(
    '[workbench] no global screenshot shortcut available; use the tray menu instead.'
  )
  return null
}

export function getScreenshotShortcutLabel(): string | null {
  return shortcutLabel
}

export function unregisterScreenshotShortcut(): void {
  try {
    globalShortcut.unregisterAll()
  } catch (error) {
    console.warn('[workbench] could not unregister screenshot shortcut:', error)
  }
  shortcutLabel = null
}

/** Releases overlay, pin windows and their bitmaps when the app quits. */
export function disposeScreenshots(): void {
  if (session) closeSession(session)
  for (const pin of pinWindows.values()) {
    if (!pin.window.isDestroyed()) pin.window.destroy()
  }
  pinWindows.clear()
}
