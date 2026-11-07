import type {
  BrowserInfo,
  ExternalFileFlushInput,
  ExternalFileOpenRequest,
  ExternalFileSaveResult,
  OpenResult,
  WorkspaceData
} from '@shared/types'

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
