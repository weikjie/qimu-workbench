import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type WorkbenchApi } from '../shared/api'
import type { ExternalFileFlushInput, WorkspaceData } from '../shared/types'

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
  notes: {
    openFolder: () => ipcRenderer.invoke(IPC.openNotesFolder)
  },
  open: {
    link: (url, browserId) => ipcRenderer.invoke(IPC.openLink, { url, browserId }),
    external: (url) => ipcRenderer.invoke(IPC.openExternal, url)
  },
  files: {
    takeOpenRequests: () => ipcRenderer.invoke(IPC.takeExternalFiles),
    save: (id, content) => ipcRenderer.invoke(IPC.saveExternalFile, { id, content }),
    close: (id) => ipcRenderer.send(IPC.closeExternalFile, id),
    flush: (inputs: ExternalFileFlushInput[]) => {
      ipcRenderer.sendSync(IPC.flushExternalFiles, inputs)
    },
    onOpenAvailable: (callback) => {
      const listener = (): void => callback()
      ipcRenderer.on(IPC.externalFilesAvailable, listener)
      return () => ipcRenderer.removeListener(IPC.externalFilesAvailable, listener)
    }
  }
}

contextBridge.exposeInMainWorld('workbench', api)
