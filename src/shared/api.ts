import type {
  BrowserInfo,
  ExternalFileFlushInput,
  ExternalFileOpenRequest,
  ExternalFileSaveResult,
  OpenResult,
  WorkspaceData
} from './types'

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
  flushExternalFiles: 'files:flush'
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
}
