import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const WORKSPACE_FILE = 'workspace.json'

export type RuntimeEnvironment = 'development' | 'production'

export interface AppDataPaths {
  environment: RuntimeEnvironment
  /** All app-owned data lives directly in this directory. */
  root: string
  workspaceFile: string
  /** Electron's previous location, used only for the one-time migration. */
  legacyWorkspaceFile: string
}

let cachedPaths: AppDataPaths | null = null

function migrateLegacyWorkspace(legacyFile: string, targetFile: string): void {
  if (legacyFile === targetFile || existsSync(targetFile) || !existsSync(legacyFile)) return

  try {
    copyFileSync(legacyFile, targetFile)
    console.info(`[workbench] migrated workspace data from ${legacyFile} to ${targetFile}`)
  } catch (error) {
    console.error('[workbench] could not migrate legacy workspace data:', error)
  }
}

/**
 * Chooses a stable, environment-specific home for every piece of app data.
 *
 * Production: ~/.qimu-workbench
 * Development: ~/.qimu-workbench-dev
 *
 * Calling this before `requestSingleInstanceLock()` also gives the two
 * environments independent Chromium sessions and independent single-instance
 * locks, so they can run side by side without touching each other's data.
 */
export function configureAppDataPaths(): AppDataPaths {
  if (cachedPaths) return cachedPaths

  const environment: RuntimeEnvironment = app.isPackaged ? 'production' : 'development'
  const root = join(
    homedir(),
    environment === 'production' ? '.qimu-workbench' : '.qimu-workbench-dev'
  )
  const workspaceFile = join(root, WORKSPACE_FILE)

  // Capture Electron's previous default before overriding it. This points at
  // the old %APPDATA%/qimu-workbench (or platform equivalent) directory.
  const legacyUserData = app.getPath('userData')
  const legacyWorkspaceFile = join(legacyUserData, WORKSPACE_FILE)

  mkdirSync(root, { recursive: true })

  app.setPath('userData', root)
  // Keep Chromium's local storage and caches in the same environment folder,
  // so dev experiments cannot affect production UI state either.
  app.setPath('sessionData', root)

  migrateLegacyWorkspace(legacyWorkspaceFile, workspaceFile)

  cachedPaths = { environment, root, workspaceFile, legacyWorkspaceFile }
  console.info(`[workbench] ${environment} data directory: ${root}`)
  return cachedPaths
}

export function getAppDataPaths(): AppDataPaths {
  return cachedPaths ?? configureAppDataPaths()
}
