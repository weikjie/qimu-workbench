import type {
  BrowserInfo,
  ExternalFileFlushInput,
  ExternalFileOpenRequest,
  ExternalFileSaveResult,
  OpenResult,
  SavePastedImageInput,
  SavePastedImageResult,
  WorkspaceData
} from './types'
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
} from './screenshot'

export const IPC = {
  loadWorkspace: 'workspace:load',
  saveWorkspace: 'workspace:save',
  flushWorkspace: 'workspace:flush',
  listBrowsers: 'browsers:list',
  openLink: 'links:open',
  openExternal: 'shell:open-external',
  openNotesFolder: 'notes:open-folder',
  takeExternalFiles: 'files:take-open-requests',
  externalFilesAvailable: 'files:available',
  saveExternalFile: 'files:save',
  closeExternalFile: 'files:close',
  flushExternalFiles: 'files:flush',
  savePastedImage: 'images:save',
  copyText: 'clipboard:copy-text',
  screenshotStart: 'screenshot:start',
  screenshotShortcut: 'screenshot:shortcut',
  screenshotOverlayContext: 'screenshot:overlay-context',
  screenshotLockDisplay: 'screenshot:lock-display',
  screenshotFinish: 'screenshot:finish',
  screenshotCancel: 'screenshot:cancel',
  screenshotCopyText: 'screenshot:copy-text',
  screenshotPinContext: 'screenshot:pin-context',
  screenshotPinAction: 'screenshot:pin-action',
  screenshotPinMove: 'screenshot:pin-move',
  screenshotPinZoom: 'screenshot:pin-zoom'
} as const

/** The small, typed surface exposed to the renderer by the preload bridge. */
export interface WorkbenchApi {
  storage: {
    load(): Promise<WorkspaceData>
    save(data: WorkspaceData): Promise<void>
    /** Best-effort synchronous flush used when the window is closing. */
    flush(data: WorkspaceData): void
  }
  browsers: {
    list(): Promise<BrowserInfo[]>
  }
  notes: {
    /** Opens the folder that stores each note as a real .md file. */
    openFolder(): Promise<OpenResult>
  }
  open: {
    link(url: string, browserId: string | null): Promise<OpenResult>
    external(url: string): Promise<OpenResult>
  }
  images: {
    /** Saves clipboard image bytes next to the note or Markdown file and
     * returns a path that can be embedded in Markdown. */
    save(input: SavePastedImageInput): Promise<SavePastedImageResult>
  }
  clipboard: {
    /** Writes plain text to the operating system clipboard. */
    writeText(text: string): Promise<OpenResult>
  }
  files: {
    /** Consumes Markdown files queued by the main process. */
    takeOpenRequests(): Promise<ExternalFileOpenRequest[]>
    save(id: string, content: string): Promise<ExternalFileSaveResult>
    close(id: string): void
    /** Synchronous best-effort write when the window is closing. */
    flush(inputs: ExternalFileFlushInput[]): void
    /** Fires when the main process has queued new file-open requests. */
    onOpenAvailable(callback: () => void): () => void
  }
  screenshot: {
    /** Starts a capture and opens the selection overlays. */
    start(): Promise<OpenResult>
    /** The global shortcut label that was actually registered. */
    getShortcut(): Promise<string | null>
    /** Returns the frozen screen and session metadata for one overlay. */
    getOverlayContext(
      sessionId: string,
      displayId: number
    ): Promise<ScreenshotOverlayContext | null>
    /** Closes the overlays on every other display once a selection starts. */
    lockDisplay(sessionId: string, displayId: number): void
    /** Copies, saves or pins the annotated selection. */
    finish(input: ScreenshotFinishInput): Promise<ScreenshotActionResult>
    /** Cancels the whole capture and closes every overlay. */
    cancel(sessionId: string): void
    /** Copies a color value sampled by the selection overlay. */
    copyText(text: string): Promise<OpenResult>
    /** Data for one pinned image window. */
    getPinContext(id: string): Promise<ScreenshotPinContext | null>
    pinAction(input: ScreenshotPinActionInput): Promise<ScreenshotPinActionResult>
    /** Moves a pinned image window while the user drags it. */
    pinMove(input: ScreenshotPinMoveInput): void
    /** Resizes a pinned image window when the user scrolls its wheel. */
    pinZoom(input: ScreenshotPinZoomInput): Promise<ScreenshotPinZoomResult>
  }
}
