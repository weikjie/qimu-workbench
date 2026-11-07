import type { BrowserInfo, OpenResult, WorkspaceData } from '@shared/types'

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
  openLink(url: string, browserId: string | null): Promise<OpenResult> {
    return bridge().open.link(url, browserId)
  },
  openExternal(url: string): Promise<OpenResult> {
    return bridge().open.external(url)
  }
}
