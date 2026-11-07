import type { BrowserInfo, OpenResult, WorkspaceData } from './types'

export const IPC = {
  loadWorkspace: 'workspace:load',
  saveWorkspace: 'workspace:save',
  flushWorkspace: 'workspace:flush',
  listBrowsers: 'browsers:list',
  openLink: 'links:open',
  openExternal: 'shell:open-external'
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
  open: {
    link(url: string, browserId: string | null): Promise<OpenResult>
    external(url: string): Promise<OpenResult>
  }
}
