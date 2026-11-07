import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type WorkbenchApi } from '../shared/api'
import type { WorkspaceData } from '../shared/types'

const api: WorkbenchApi = {
  storage: {
    load: () => ipcRenderer.invoke(IPC.loadWorkspace),
    save: (data: WorkspaceData) => ipcRenderer.invoke(IPC.saveWorkspace, data),
    flush: (data: WorkspaceData) => {
      ipcRenderer.sendSync(IPC.flushWorkspace, data)
    }
  },
  browsers: {
    list: () => ipcRenderer.invoke(IPC.listBrowsers)
  },
  open: {
    link: (url, browserId) => ipcRenderer.invoke(IPC.openLink, { url, browserId }),
    external: (url) => ipcRenderer.invoke(IPC.openExternal, url)
  }
}

contextBridge.exposeInMainWorld('workbench', api)
