import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createDefaultWorkspace } from '../shared/defaults'
import { getAppDataPaths } from './data-paths'
import type { MarkdownNote, QuickLink, Todo, WorkspaceData } from '../shared/types'

const MAX_TODOS = 5000
const MAX_LINKS = 2000
const MAX_NOTES = 2000
const MAX_NOTE_CHARS = 2_000_000

function dataFile(): string {
  return getAppDataPaths().workspaceFile
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function isoDate(value: unknown, fallback: string): string {
  const candidate = text(value)
  return Number.isNaN(Date.parse(candidate)) ? fallback : candidate
}

function sanitizeTodos(input: unknown): Todo[] {
  if (!Array.isArray(input)) return []
  const now = new Date().toISOString()
  return input
    .slice(0, MAX_TODOS)
    .map((value): Todo | null => {
      const item = record(value)
      if (!item) return null
      const title = text(item.title).trim()
      if (!title) return null
      const done = item.done === true
      return {
        id: text(item.id) || crypto.randomUUID(),
        title: title.slice(0, 500),
        done,
        createdAt: isoDate(item.createdAt, now),
        completedAt: done ? isoDate(item.completedAt, now) : null
      }
    })
    .filter((item): item is Todo => item !== null)
}

function sanitizeLinks(input: unknown): QuickLink[] {
  if (!Array.isArray(input)) return []
  const now = new Date().toISOString()
  return input
    .slice(0, MAX_LINKS)
    .map((value): QuickLink | null => {
      const item = record(value)
      if (!item) return null
      const title = text(item.title).trim()
      const url = normalizeHttpUrl(text(item.url))
      if (!title || !url) return null
      const browserId = typeof item.browserId === 'string' && item.browserId ? item.browserId : null
      return {
        id: text(item.id) || crypto.randomUUID(),
        title: title.slice(0, 200),
        url,
        browserId: browserId?.slice(0, 100) ?? null,
        createdAt: isoDate(item.createdAt, now)
      }
    })
    .filter((item): item is QuickLink => item !== null)
}

function sanitizeNotes(input: unknown): MarkdownNote[] {
  if (!Array.isArray(input)) return []
  const now = new Date().toISOString()
  return input
    .slice(0, MAX_NOTES)
    .map((value): MarkdownNote | null => {
      const item = record(value)
      if (!item) return null
      const content = text(item.content)
      if (content.length > MAX_NOTE_CHARS) return null
      const createdAt = isoDate(item.createdAt, now)
      return {
        id: text(item.id) || crypto.randomUUID(),
        title: text(item.title).trim().slice(0, 300) || '无标题笔记',
        content,
        createdAt,
        updatedAt: isoDate(item.updatedAt, createdAt)
      }
    })
    .filter((item): item is MarkdownNote => item !== null)
}

/** Normalizes data that came from disk or from IPC before it is written back. */
export function sanitizeWorkspace(input: unknown): WorkspaceData {
  const root = record(input)
  if (!root) return createDefaultWorkspace()
  return {
    version: 1,
    todos: sanitizeTodos(root.todos),
    links: sanitizeLinks(root.links),
    notes: sanitizeNotes(root.notes)
  }
}

export function normalizeHttpUrl(input: string): string | null {
  const candidate = input.trim()
  if (!candidate) return null
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate) ? candidate : `https://${candidate}`
  try {
    const url = new URL(withProtocol)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

export async function loadWorkspace(): Promise<WorkspaceData> {
  try {
    const raw = await readFile(dataFile(), 'utf8')
    return sanitizeWorkspace(JSON.parse(raw))
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code && code !== 'ENOENT') {
      console.warn('[workbench] could not read workspace, starting fresh:', error)
    }
    return createDefaultWorkspace()
  }
}

async function writeWorkspace(data: WorkspaceData): Promise<void> {
  const file = dataFile()
  const temp = `${file}.${process.pid}.tmp`
  const serialized = JSON.stringify(data, null, 2)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(temp, serialized, 'utf8')
  try {
    await rename(temp, file)
  } catch {
    // On Windows, an antivirus hand-off can briefly lock the destination.
    // Fall back to a copy so the user's latest changes still land.
    await copyFile(temp, file)
    await unlink(temp).catch(() => undefined)
  }
}

let writeQueue: Promise<void> = Promise.resolve()

export function queueWorkspaceSave(input: unknown): Promise<void> {
  const safe = sanitizeWorkspace(input)
  // A failed write must not poison every future write in the session.
  const write = writeQueue.catch(() => undefined).then(() => writeWorkspace(safe)).catch((error) => {
    console.error('[workbench] workspace save failed:', error)
    throw error
  })
  writeQueue = write
  return write
}

/** Used only from the synchronous close/unload path. */
export function flushWorkspaceSync(input: unknown): void {
  try {
    const safe = sanitizeWorkspace(input)
    const file = dataFile()
    const temp = `${file}.${process.pid}.tmp`
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(temp, JSON.stringify(safe, null, 2), 'utf8')
    if (existsSync(file)) {
      // A simple rename preserves the old file if anything goes wrong.
      try {
        renameSync(temp, file)
      } catch {
        writeFileSync(file, JSON.stringify(safe, null, 2), 'utf8')
      }
    } else {
      renameSync(temp, file)
    }
  } catch (error) {
    console.error('[workbench] synchronous flush failed:', error)
  }
}
