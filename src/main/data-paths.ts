import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const WORKSPACE_FILE = 'workspace.json'

export type RuntimeEnvironment = 'development' | 'production'

export interface AppDataPaths {
  environment: RuntimeEnvironment
  /** All app-owned data lives directly in this directory. */
  root: string
  workspaceFile: string
  /** Each built-in note is stored as a real Markdown file in this directory. */
  notesDir: string
  /** Chromium caches, storage and other Electron runtime state. */
  runtimeDir: string
}

let cachedPaths: AppDataPaths | null = null

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
  const notesDir = join(root, 'notes')
  const runtimeDir = join(root, 'runtime')

  mkdirSync(root, { recursive: true })
  mkdirSync(notesDir, { recursive: true })
  mkdirSync(runtimeDir, { recursive: true })

  // Keep Chromium's profile inside the environment folder so dev experiments
  // cannot affect production, while keeping business data at the root.
  app.setPath('userData', runtimeDir)
  app.setPath('sessionData', runtimeDir)

  cachedPaths = { environment, root, workspaceFile, notesDir, runtimeDir }
  console.info(`[workbench] ${environment} data directory: ${root}`)
  return cachedPaths
}

export function getAppDataPaths(): AppDataPaths {
  return cachedPaths ?? configureAppDataPaths()
}
