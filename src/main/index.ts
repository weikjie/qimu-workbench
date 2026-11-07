import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { IPC } from '../shared/api'
import { detectBrowsers, listBrowserInfo, openExternalUrl, openInBrowser } from './browsers'
import { configureAppDataPaths } from './data-paths'
import { flushWorkspaceSync, loadWorkspace, queueWorkspaceSave } from './store'

let mainWindow: BrowserWindow | null = null

// Must run before the single-instance lock and before Electron creates any
// session storage, so dev and production get separate Chromium profiles.
configureAppDataPaths()

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

function iconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../resources/icon.png')
}

function isTrustedSender(event: Electron.IpcMainInvokeEvent): boolean {
  return Boolean(mainWindow && event.sender === mainWindow.webContents)
}

function isSafeString(value: unknown, maxLength = 4000): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

async function captureForQa(window: BrowserWindow): Promise<void> {
  const output = process.env['WORKBENCH_CAPTURE']
  if (!output || app.isPackaged) return

  await new Promise((resolve) => setTimeout(resolve, 1400))
  const view = process.env['WORKBENCH_CAPTURE_VIEW']
  if (view && view !== 'overview') {
    await window.webContents
      .executeJavaScript(`document.querySelector('[data-section="${view}"]')?.click()`, true)
      .catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 650))
  }
  const image = await window.webContents.capturePage()
  await writeFile(output, image.toPNG())
  app.quit()
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    backgroundColor: '#f4f6f2',
    title: '栖木工作台',
    icon: iconPath(),
    titleBarStyle: 'hidden',
    titleBarOverlay:
      process.platform === 'win32'
        ? {
            color: '#fbfcf9',
            symbolColor: '#4d5b51',
            height: 64
          }
        : undefined,
    trafficLightPosition: { x: 20, y: 24 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL()
    if (current && url === current) return
    event.preventDefault()
    void openExternalUrl(url)
  })

  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (process.env['WORKBENCH_CAPTURE']) {
    void captureForQa(mainWindow)
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.loadWorkspace, async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return loadWorkspace()
  })

  ipcMain.handle(IPC.saveWorkspace, async (event, data: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    await queueWorkspaceSave(data)
  })

  ipcMain.on(IPC.flushWorkspace, (event, data: unknown) => {
    if (isTrustedSender(event)) flushWorkspaceSync(data)
    event.returnValue = true
  })

  ipcMain.handle(IPC.listBrowsers, async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return listBrowserInfo()
  })

  ipcMain.handle(IPC.openLink, async (event, payload: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const input = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {}
    if (!isSafeString(input['url'])) return { ok: false, message: '链接地址不能为空。' }
    const browserId = typeof input['browserId'] === 'string' ? input['browserId'] : null
    return openInBrowser(input['url'], browserId)
  })

  ipcMain.handle(IPC.openExternal, async (event, url: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    if (!isSafeString(url)) return { ok: false, message: '链接地址不能为空。' }
    return openExternalUrl(url)
  })
}

app.whenReady().then(async () => {
  if (!gotTheLock) return

  app.setAppUserModelId('com.qimu.workbench')
  Menu.setApplicationMenu(null)
  await detectBrowsers()
  registerIpc()
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const current = contents.getURL()
    if (url === current) return
    event.preventDefault()
    void openExternalUrl(url)
  })
})
