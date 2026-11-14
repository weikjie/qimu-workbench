import type {
  BrowserInfo,
  ExternalFileFlushInput,
  ExternalFileOpenRequest,
  ExternalFileSaveResult,
  OpenResult,
  PastedImageTarget,
  SavePastedImageResult,
  WorkspaceData
} from '@shared/types'
import type {
  ScreenshotActionResult,
  ScreenshotFinishInput,
  ScreenshotOverlayContext,
  ScreenshotPinActionInput,
  ScreenshotPinActionResult,
  ScreenshotPinContext,
  ScreenshotPinMoveInput,
  ScreenshotPinZoomInput,
  ScreenshotPinZoomResult
} from '@shared/screenshot'

/**
 * The only place in the renderer that talks to Electron. Feature modules use
 * these small functions instead of reaching into window.workbench directly.
 */
function bridge(): NonNullable<Window['workbench']> {
  if (!window.workbench) {
    throw new Error('桌面桥接未加载，请重新启动应用。')
  }
  return window.workbench
}

export const desktop = {
  loadWorkspace(): Promise<WorkspaceData> {
    return bridge().storage.load()
  },
  saveWorkspace(data: WorkspaceData): Promise<void> {
    return bridge().storage.save(data)
  },
  flushWorkspace(data: WorkspaceData): void {
    bridge().storage.flush(data)
  },
  listBrowsers(): Promise<BrowserInfo[]> {
    return bridge().browsers.list()
  },
  openNotesFolder(): Promise<OpenResult> {
    return bridge().notes.openFolder()
  },
  openLink(url: string, browserId: string | null): Promise<OpenResult> {
    return bridge().open.link(url, browserId)
  },
  openExternal(url: string): Promise<OpenResult> {
    return bridge().open.external(url)
  },
  savePastedImage(
    target: PastedImageTarget,
    id: string,
    data: ArrayBuffer
  ): Promise<SavePastedImageResult> {
    return bridge().images.save({ target, id, data })
  },
  copyText(text: string): Promise<OpenResult> {
    return bridge().clipboard.writeText(text)
  },
  takeOpenFileRequests(): Promise<ExternalFileOpenRequest[]> {
    return bridge().files.takeOpenRequests()
  },
  saveOpenFile(id: string, content: string): Promise<ExternalFileSaveResult> {
    return bridge().files.save(id, content)
  },
  closeOpenFile(id: string): void {
    bridge().files.close(id)
  },
  flushOpenFiles(inputs: ExternalFileFlushInput[]): void {
    bridge().files.flush(inputs)
  },
  onOpenFilesAvailable(callback: () => void): () => void {
    return bridge().files.onOpenAvailable(callback)
  }
}

export const screenshotBridge = {
  start(): Promise<OpenResult> {
    return bridge().screenshot.start()
  },
  getShortcut(): Promise<string | null> {
    return bridge().screenshot.getShortcut()
  },
  getOverlayContext(
    sessionId: string,
    displayId: number
  ): Promise<ScreenshotOverlayContext | null> {
    return bridge().screenshot.getOverlayContext(sessionId, displayId)
  },
  lockDisplay(sessionId: string, displayId: number): void {
    bridge().screenshot.lockDisplay(sessionId, displayId)
  },
  finish(input: ScreenshotFinishInput): Promise<ScreenshotActionResult> {
    return bridge().screenshot.finish(input)
  },
  cancel(sessionId: string): void {
    bridge().screenshot.cancel(sessionId)
  },
  copyText(text: string): Promise<OpenResult> {
    return bridge().screenshot.copyText(text)
  },
  getPinContext(id: string): Promise<ScreenshotPinContext | null> {
    return bridge().screenshot.getPinContext(id)
  },
  pinAction(input: ScreenshotPinActionInput): Promise<ScreenshotPinActionResult> {
    return bridge().screenshot.pinAction(input)
  },
  pinMove(input: ScreenshotPinMoveInput): void {
    bridge().screenshot.pinMove(input)
  },
  pinZoom(input: ScreenshotPinZoomInput): Promise<ScreenshotPinZoomResult> {
    return bridge().screenshot.pinZoom(input)
  }
}
