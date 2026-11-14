import { app, BrowserWindow, Menu, Tray, clipboard, ipcMain, protocol, shell } from 'electron'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { IPC } from '../shared/api'
import { EXTERNAL_ASSET_HOST, EXTERNAL_ASSET_SCHEME, NOTE_ASSET_HOST } from '../shared/assets'
import { detectBrowsers, listBrowserInfo, openExternalUrl, openInBrowser } from './browsers'
import { configureAppDataPaths, getAppDataPaths } from './data-paths'
import {
  closeExternalDocument,
  extractMarkdownPaths,
  flushExternalDocumentsSync,
  queueExternalMarkdown,
  readExternalAsset,
  saveExternalDocument,
  saveExternalPastedImage,
  takeExternalOpenRequests
} from './external-files'
import type { ImageAsset } from './image-files'
import { readNoteAsset, saveNotePastedImage } from './note-images'
import {
  disposeScreenshots,
  getScreenshotShortcutLabel,
  registerScreenshotIpc,
  registerScreenshotShortcut,
  startScreenshotFromSystem,
  unregisterScreenshotShortcut
} from './screenshot'
import { flushWorkspaceSync, loadWorkspace, queueWorkspaceSave } from './store'

protocol.registerSchemesAsPrivileged([
  {
    scheme: EXTERNAL_ASSET_SCHEME,
    privileges: { standard: true, secure: true }
  }
])

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
const initialMarkdownPaths = extractMarkdownPaths(process.argv, process.cwd())

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

function trayIconPath(): string {
  const fileName = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  return app.isPackaged
    ? join(process.resourcesPath, fileName)
    : join(__dirname, '../../resources', fileName)
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray(): void {
  if (tray) return
  try {
    tray = new Tray(trayIconPath())
    tray.setToolTip('栖木工作台')
    const shortcut = getScreenshotShortcutLabel()
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: shortcut ? `截图（${shortcut}）` : '截图',
          click: () => {
            void startScreenshotFromSystem()
          }
        },
        { type: 'separator' },
        { label: '打开栖木工作台', click: showMainWindow },
        { type: 'separator' },
        {
          label: '退出',
          click: () => {
            isQuitting = true
            app.quit()
          }
        }
      ])
    )
    tray.on('click', showMainWindow)
    tray.on('double-click', showMainWindow)
  } catch (error) {
    tray = null
    console.error('[workbench] could not create tray icon:', error)
  }
}

function isTrustedSender(event: Electron.IpcMainInvokeEvent): boolean {
  return Boolean(mainWindow && event.sender === mainWindow.webContents)
}

function isSafeString(value: unknown, maxLength = 4000): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

function imageResponse(asset: ImageAsset | null): Response {
  if (!asset) return new Response(null, { status: 404 })

  // The asset buffer is a fresh, exact-length copy, so its ArrayBuffer can
  // be handed to Response directly.
  return new Response(asset.data.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'content-type': asset.contentType,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  })
}

function registerExternalAssetProtocol(): void {
  protocol.handle(EXTERNAL_ASSET_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const source = url.searchParams.get('path')
      if (!source) return new Response(null, { status: 404 })

      if (url.hostname === EXTERNAL_ASSET_HOST) {
        const documentId = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
        if (!documentId) return new Response(null, { status: 404 })
        return imageResponse(await readExternalAsset(documentId, source))
      }

      if (url.hostname === NOTE_ASSET_HOST) {
        const noteId = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
        if (!noteId) return new Response(null, { status: 404 })
        return imageResponse(await readNoteAsset(noteId, source))
      }

      return new Response(null, { status: 404 })
    } catch (error) {
      console.warn('[workbench] image protocol request failed:', error)
      return new Response(null, { status: 400 })
    }
  })
}

function notifyExternalFilesAvailable(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(IPC.externalFilesAvailable)
}

async function acceptMarkdownFiles(paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return
  for (const filePath of paths) {
    await queueExternalMarkdown(filePath)
  }
  notifyExternalFilesAvailable()
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

  mainWindow.on('close', (event) => {
    if (isQuitting || !tray) return
    event.preventDefault()
    mainWindow?.hide()
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

  ipcMain.handle(IPC.openNotesFolder, async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const message = await shell.openPath(getAppDataPaths().notesDir)
    return message ? { ok: false, message: `无法打开笔记文件夹：${message}` } : { ok: true }
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

  ipcMain.handle(IPC.takeExternalFiles, async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return takeExternalOpenRequests()
  })

  ipcMain.handle(IPC.copyText, async (event, text: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    if (!isSafeString(text, 10_000)) {
      return { ok: false, message: '要复制的内容无效。' }
    }
    try {
      await clipboard.writeText(text)
      return { ok: true }
    } catch (error) {
      console.error('[workbench] could not write to clipboard:', error)
      return { ok: false, message: '复制到剪贴板失败。' }
    }
  })

  ipcMain.handle(IPC.savePastedImage, async (event, payload: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const input = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {}
    const target = input['target']
    const id = input['id']
    const raw = input['data']
    if (target !== 'note' && target !== 'file') {
      return { ok: false, message: '图片目标无效。' }
    }
    if (!isSafeString(id, 100)) {
      return { ok: false, message: '图片目标无效。' }
    }

    let bytes: Uint8Array
    if (raw instanceof ArrayBuffer) {
      bytes = new Uint8Array(raw)
    } else if (ArrayBuffer.isView(raw)) {
      bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
    } else {
      return { ok: false, message: '图片数据无效。' }
    }

    try {
      return target === 'note'
        ? await saveNotePastedImage(id, bytes)
        : await saveExternalPastedImage(id, bytes)
    } catch (error) {
      console.error('[workbench] could not save pasted image:', error)
      return { ok: false, message: '图片保存失败，请稍后重试。' }
    }
  })

  ipcMain.handle(IPC.saveExternalFile, async (event, payload: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const input = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {}
    if (!isSafeString(input['id'], 100)) {
      return { ok: false, message: '文件标识无效。' }
    }
    if (typeof input['content'] !== 'string') {
      return { ok: false, message: '文件内容无效。' }
    }
    return saveExternalDocument(input['id'], input['content'])
  })

  ipcMain.on(IPC.closeExternalFile, (event, id: unknown) => {
    if (!isTrustedSender(event) || !isSafeString(id, 100)) return
    closeExternalDocument(id)
  })

  ipcMain.on(IPC.flushExternalFiles, (event, inputs: unknown) => {
    if (isTrustedSender(event) && Array.isArray(inputs)) {
      flushExternalDocumentsSync(
        inputs.filter(
          (input): input is { id: string; content: string } =>
            typeof input === 'object' &&
            input !== null &&
            typeof (input as Record<string, unknown>)['id'] === 'string' &&
            typeof (input as Record<string, unknown>)['content'] === 'string'
        )
      )
    }
    event.returnValue = true
  })
}

app.whenReady().then(async () => {
  if (!gotTheLock) return

  app.setAppUserModelId('com.qimu.workbench')
  Menu.setApplicationMenu(null)
  registerExternalAssetProtocol()
  await detectBrowsers()
  registerIpc()
  registerScreenshotIpc({
    isMainWindowSender: (sender) => Boolean(mainWindow && sender === mainWindow.webContents)
  })
  registerScreenshotShortcut()
  createTray()
  await createWindow()

  if (initialMarkdownPaths.length > 0) {
    void acceptMarkdownFiles(initialMarkdownPaths)
  }

  app.on('activate', showMainWindow)
})

app.on('before-quit', () => {
  isQuitting = true
  disposeScreenshots()
})

app.on('will-quit', () => {
  unregisterScreenshotShortcut()
})

app.on('second-instance', (_event, commandLine, workingDirectory) => {
  showMainWindow()
  const paths = extractMarkdownPaths(commandLine, workingDirectory)
  void acceptMarkdownFiles(paths)
})

// macOS delivers file associations through open-file instead of argv.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  const paths = extractMarkdownPaths([filePath], process.cwd())
  void acceptMarkdownFiles(paths)
})

// The tray keeps the workspace alive after its window is hidden. A real quit
// only happens from the tray menu (or the operating system). If the tray could
// not be created, fall back to the normal quit behavior.
app.on('window-all-closed', () => {
  if (!tray && process.platform !== 'darwin') app.quit()
})

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const current = contents.getURL()
    if (url === current) return
    event.preventDefault()
    void openExternalUrl(url)
  })
})
