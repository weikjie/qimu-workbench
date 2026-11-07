import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { BrowserInfo, OpenResult } from '../shared/types'
import { normalizeHttpUrl } from './store'

const execFileAsync = promisify(execFile)

interface BrowserCandidate {
  id: string
  name: string
  family: BrowserInfo['family']
  paths: string[]
}

interface DetectedBrowser extends BrowserInfo {
  executablePath: string
}

let cache: DetectedBrowser[] | null = null

function platformPaths(winPaths: string[], macPaths: string[], linuxPaths: string[]): string[] {
  if (process.platform === 'win32') return winPaths
  if (process.platform === 'darwin') return macPaths
  return linuxPaths
}

function candidateList(): BrowserCandidate[] {
  const programFiles = process.env['PROGRAMFILES'] ?? 'C:\\Program Files'
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'
  const localAppData = process.env['LOCALAPPDATA'] ?? ''
  const roamingAppData = process.env['APPDATA'] ?? ''

  return [
    {
      id: 'chrome',
      name: 'Google Chrome',
      family: 'chromium',
      paths: platformPaths(
        [
          join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')
        ],
        ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
        ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
      )
    },
    {
      id: 'edge',
      name: 'Microsoft Edge',
      family: 'chromium',
      paths: platformPaths(
        [
          join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
          join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
          join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
        ],
        ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
        ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable']
      )
    },
    {
      id: 'firefox',
      name: 'Mozilla Firefox',
      family: 'firefox',
      paths: platformPaths(
        [
          join(programFiles, 'Mozilla Firefox', 'firefox.exe'),
          join(programFilesX86, 'Mozilla Firefox', 'firefox.exe'),
          join(localAppData, 'Mozilla Firefox', 'firefox.exe')
        ],
        ['/Applications/Firefox.app/Contents/MacOS/firefox'],
        ['/usr/bin/firefox']
      )
    },
    {
      id: 'brave',
      name: 'Brave',
      family: 'chromium',
      paths: platformPaths(
        [
          join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
          join(programFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
          join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
        ],
        ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
        ['/usr/bin/brave-browser', '/usr/bin/brave-browser-stable']
      )
    },
    {
      id: 'vivaldi',
      name: 'Vivaldi',
      family: 'chromium',
      paths: platformPaths(
        [
          join(programFiles, 'Vivaldi', 'Application', 'vivaldi.exe'),
          join(localAppData, 'Vivaldi', 'Application', 'vivaldi.exe')
        ],
        ['/Applications/Vivaldi.app/Contents/MacOS/Vivaldi'],
        ['/usr/bin/vivaldi', '/usr/bin/vivaldi-stable']
      )
    },
    {
      id: 'opera',
      name: 'Opera',
      family: 'chromium',
      paths: platformPaths(
        [
          join(localAppData, 'Programs', 'Opera', 'opera.exe'),
          join(roamingAppData, 'Opera', 'opera.exe'),
          join(programFiles, 'Opera', 'opera.exe')
        ],
        ['/Applications/Opera.app/Contents/MacOS/Opera'],
        ['/usr/bin/opera']
      )
    }
  ]
}

async function registryExecutable(exeName: string): Promise<string | null> {
  if (process.platform !== 'win32') return null
  const keys = [
    `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
    `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
    `HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`
  ]

  for (const key of keys) {
    try {
      const { stdout } = await execFileAsync('reg.exe', ['query', key, '/ve'], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 4000
      })
      const match = stdout.match(/REG_SZ\s+(.+?)\s*$/m)
      if (match?.[1] && existsSync(match[1])) return match[1]
    } catch {
      // The key is simply not present; move on to the next known location.
    }
  }
  return null
}

/** Detects installed desktop browsers without asking the user to locate them. */
export async function detectBrowsers(): Promise<DetectedBrowser[]> {
  if (cache) return cache

  const found: DetectedBrowser[] = []
  const seenIds = new Set<string>()

  for (const browser of candidateList()) {
    if (seenIds.has(browser.id)) continue
    const executablePath = browser.paths.find((candidate) => candidate && existsSync(candidate))
    if (executablePath) {
      found.push({
        id: browser.id,
        name: browser.name,
        family: browser.family,
        executablePath
      })
      seenIds.add(browser.id)
    }
  }

  // A custom installation location can still be discovered through
  // App Paths. This is intentionally best-effort and cached for the session.
  const registryCandidates: Array<[string, string]> = [
    ['chrome', 'chrome.exe'],
    ['edge', 'msedge.exe'],
    ['firefox', 'firefox.exe'],
    ['brave', 'brave.exe'],
    ['vivaldi', 'vivaldi.exe'],
    ['opera', 'launcher.exe']
  ]

  await Promise.all(
    registryCandidates.map(async ([id, exe]) => {
      if (seenIds.has(id)) return
      const executablePath = await registryExecutable(exe)
      if (!executablePath) return
      const info = candidateList().find((browser) => browser.id === id)
      if (!info) return
      found.push({
        id: info.id,
        name: info.name,
        family: info.family,
        executablePath
      })
      seenIds.add(id)
    })
  )

  cache = found
  return found
}

export async function listBrowserInfo(): Promise<BrowserInfo[]> {
  const browsers = await detectBrowsers()
  return browsers.map(({ id, name, family }) => ({ id, name, family }))
}

function isWebUrl(url: string): boolean {
  return normalizeHttpUrl(url) !== null
}

export async function openInBrowser(url: string, browserId: string | null): Promise<OpenResult> {
  if (!isWebUrl(url)) {
    return { ok: false, message: '这个链接的地址格式不正确，请检查后再试。' }
  }

  try {
    if (!browserId) {
      const { shell } = await import('electron')
      await shell.openExternal(normalizeHttpUrl(url)!)
      return { ok: true }
    }

    const browser = (await detectBrowsers()).find((item) => item.id === browserId)
    if (!browser) {
      return {
        ok: false,
        message: '没有找到这台设备上已选择的浏览器，可能已被卸载。可以改用系统默认浏览器。'
      }
    }

    const { spawn } = await import('node:child_process')
    const child = spawn(browser.executablePath, [normalizeHttpUrl(url)!], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    })

    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => resolve())
      child.once('error', reject)
    })
    child.unref()
    return { ok: true }
  } catch (error) {
    console.error('[workbench] could not open link:', error)
    return { ok: false, message: '打开链接时遇到问题，请稍后再试。' }
  }
}

export async function openExternalUrl(url: string): Promise<OpenResult> {
  if (!isWebUrl(url)) {
    return { ok: false, message: '不支持打开这个地址。' }
  }
  try {
    const { shell } = await import('electron')
    await shell.openExternal(normalizeHttpUrl(url)!)
    return { ok: true }
  } catch (error) {
    console.error('[workbench] could not open external url:', error)
    return { ok: false, message: '无法使用系统浏览器打开这个链接。' }
  }
}
