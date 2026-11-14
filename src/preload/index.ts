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
  images: {
    save: (input) => ipcRenderer.invoke(IPC.savePastedImage, input)
  },
  clipboard: {
    writeText: (text) => ipcRenderer.invoke(IPC.copyText, text)
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
  },
  screenshot: {
    start: () => ipcRenderer.invoke(IPC.screenshotStart),
    getShortcut: () => ipcRenderer.invoke(IPC.screenshotShortcut),
    getOverlayContext: (sessionId, displayId) =>
      ipcRenderer.invoke(IPC.screenshotOverlayContext, { sessionId, displayId }),
    lockDisplay: (sessionId, displayId) =>
      ipcRenderer.send(IPC.screenshotLockDisplay, { sessionId, displayId }),
    overlayReady: (sessionId, displayId) =>
      ipcRenderer.send(IPC.screenshotOverlayReady, { sessionId, displayId }),
    finish: (input) => ipcRenderer.invoke(IPC.screenshotFinish, input),
    cancel: (sessionId) => ipcRenderer.send(IPC.screenshotCancel, { sessionId }),
    copyText: (text) => ipcRenderer.invoke(IPC.screenshotCopyText, { text }),
    getPinContext: (id) => ipcRenderer.invoke(IPC.screenshotPinContext, { id }),
    pinAction: (input) => ipcRenderer.invoke(IPC.screenshotPinAction, input),
    pinMove: (input) => ipcRenderer.send(IPC.screenshotPinMove, input),
    pinZoom: (input) => ipcRenderer.invoke(IPC.screenshotPinZoom, input)
  }
}

contextBridge.exposeInMainWorld('workbench', api)
