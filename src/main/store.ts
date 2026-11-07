import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createDefaultWorkspace } from '../shared/defaults'
import { getAppDataPaths } from './data-paths'
import {
  MAX_NOTE_CHARS,
  fileKey,
  listNoteFiles,
  noteFileExists,
  noteFileStem,
  readNoteFile,
  removeNoteFile,
  removeNoteFileSync,
  sanitizeStoredNoteFileName,
  titleToFileStem,
  uniqueNoteFileName,
  writeNoteFile,
  writeNoteFileSync
} from './note-files'
import type { MarkdownNote, QuickLink, Todo, WorkspaceData } from '../shared/types'

const MAX_TODOS = 5000
const MAX_LINKS = 2000
const MAX_NOTES = 2000

interface PersistedNote {
  id: string
  title: string
  file: string
  createdAt: string
  updatedAt: string
}

interface PersistedWorkspace {
  version: 2
  todos: Todo[]
  links: QuickLink[]
  notes: PersistedNote[]
}

interface ParsedNote {
  id: string
  title: string
  file: string
  createdAt: string
  updatedAt: string
}

interface TrackedNote {
  file: string
  title: string
  content: string
}

interface NotePlan {
  note: MarkdownNote
  file: string
  previous: TrackedNote | null
}

/** Main-process memory of where each visible note lives on disk. */
const trackedNotes = new Map<string, TrackedNote>()

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

function laterIso(first: string, second: string): string {
  return Date.parse(second) > Date.parse(first) ? second : first
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

function parseStoredNote(value: unknown): ParsedNote | null {
  const item = record(value)
  if (!item) return null
  const file = sanitizeStoredNoteFileName(item.file)
  if (!file) return null
  const now = new Date().toISOString()
  const createdAt = isoDate(item.createdAt, now)
  return {
    id: text(item.id).slice(0, 100) || crypto.randomUUID(),
    title: text(item.title).trim().slice(0, 300) || '无标题笔记',
    file,
    createdAt,
    updatedAt: isoDate(item.updatedAt, createdAt)
  }
}

async function hydrateStoredNotes(input: unknown): Promise<MarkdownNote[]> {
  if (!Array.isArray(input)) return []

  const notes: MarkdownNote[] = []
  const usedFiles = new Set<string>()
  const usedIds = new Set<string>()

  for (const value of input.slice(0, MAX_NOTES)) {
    const parsed = parseStoredNote(value)
    if (!parsed) continue
    if (usedFiles.has(fileKey(parsed.file))) continue

    const id = usedIds.has(parsed.id) ? crypto.randomUUID() : parsed.id
    usedIds.add(id)

    const loaded = await readNoteFile(parsed.file)
    if (!loaded) {
      console.warn(`[workbench] note file is missing, skipping note: ${parsed.file}`)
      continue
    }

    usedFiles.add(fileKey(parsed.file))
    const updatedAt = laterIso(parsed.updatedAt, loaded.updatedAt)
    trackedNotes.set(id, {
      file: parsed.file,
      title: parsed.title,
      content: loaded.content
    })
    notes.push({
      id,
      title: parsed.title,
      content: loaded.content,
      createdAt: parsed.createdAt,
      updatedAt
    })
  }

  return notes
}

async function recoverNotesFromDirectory(): Promise<MarkdownNote[]> {
  const files = await listNoteFiles()
  const notes: MarkdownNote[] = []
  const usedIds = new Set<string>()

  for (const file of files.slice(0, MAX_NOTES)) {
    let id = crypto.randomUUID()
    while (usedIds.has(id)) id = crypto.randomUUID()
    usedIds.add(id)
    const title = noteFileStem(file.file).trim().slice(0, 300) || '无标题笔记'
    trackedNotes.set(id, { file: file.file, title, content: file.content })
    notes.push({
      id,
      title,
      content: file.content,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt
    })
  }

  return notes
}

async function seedNoteFiles(notes: MarkdownNote[]): Promise<MarkdownNote[]> {
  const seeded: MarkdownNote[] = []
  const usedFiles = new Set<string>()

  for (const note of notes) {
    const file = uniqueNoteFileName(titleToFileStem(note.title), usedFiles)
    try {
      await writeNoteFile(file, note.content)
      usedFiles.add(fileKey(file))
      trackedNotes.set(note.id, { file, title: note.title, content: note.content })
      seeded.push(note)
    } catch (error) {
      console.error('[workbench] could not create initial note file:', error)
      seeded.push(note)
    }
  }

  return seeded
}

async function loadWorkspaceRoot(): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(dataFile(), 'utf8')
    return record(JSON.parse(raw))
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code && code !== 'ENOENT') {
      console.warn('[workbench] could not read workspace, starting fresh:', error)
    }
    return null
  }
}

export async function loadWorkspace(): Promise<WorkspaceData> {
  trackedNotes.clear()
  const root = await loadWorkspaceRoot()

  if (!root || root.version !== 2) {
    const fallback = createDefaultWorkspace()
    const recovered = await recoverNotesFromDirectory()
    const notes = recovered.length > 0 ? recovered : await seedNoteFiles(fallback.notes)
    const data: WorkspaceData = {
      version: 1,
      todos: fallback.todos,
      links: fallback.links,
      notes
    }
    await persistWorkspaceMetadata(data).catch((error) => {
      console.error('[workbench] could not persist initial notes:', error)
    })
    return data
  }

  return {
    version: 1,
    todos: sanitizeTodos(root.todos),
    links: sanitizeLinks(root.links),
    notes: await hydrateStoredNotes(root.notes)
  }
}

function planNoteFiles(notes: MarkdownNote[]): NotePlan[] {
  const plans: NotePlan[] = []
  const used = new Set<string>()

  for (const note of notes) {
    const tracked = trackedNotes.get(note.id) ?? null
    let file = tracked?.file ?? null
    const currentStem = file ? noteFileStem(file) : null
    const desiredStem = titleToFileStem(note.title)
    const titleChanged = tracked ? tracked.title !== note.title : false
    const currentNameMatchesTitle =
      tracked &&
      currentStem !== null &&
      fileKey(currentStem) === fileKey(titleToFileStem(tracked.title)) &&
      fileKey(currentStem) !== fileKey(desiredStem)

    if (!file) {
      file = uniqueNoteFileName(desiredStem, used)
    } else if (titleChanged && currentNameMatchesTitle) {
      file = uniqueNoteFileName(desiredStem, used)
    }

    if (used.has(fileKey(file))) {
      file = uniqueNoteFileName(desiredStem, used)
    }

    used.add(fileKey(file))
    plans.push({ note, file, previous: tracked })
  }

  return plans
}

function buildPersistedWorkspace(data: WorkspaceData, files: Map<string, string>): PersistedWorkspace {
  const notes = data.notes.map((note): PersistedNote => {
    const file = files.get(note.id)
    if (!file) throw new Error(`No note file is assigned for ${note.id}`)
    return {
      id: note.id,
      title: note.title,
      file,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt
    }
  })

  return { version: 2, todos: data.todos, links: data.links, notes }
}

async function writePersistedJson(persisted: PersistedWorkspace): Promise<void> {
  const file = dataFile()
  const temp = `${file}.${process.pid}.tmp`
  const serialized = JSON.stringify(persisted, null, 2)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(temp, serialized, 'utf8')
  try {
    await rename(temp, file)
  } catch {
    // On Windows, an antivirus hand-off can briefly lock the destination.
    // Fall back to a copy so the latest metadata still lands.
    await copyFile(temp, file)
    await unlink(temp).catch(() => undefined)
  }
}

async function persistWorkspaceMetadata(data: WorkspaceData): Promise<void> {
  const files = new Map<string, string>()
  for (const note of data.notes) {
    const tracked = trackedNotes.get(note.id)
    if (!tracked) throw new Error(`No note file is tracked for ${note.id}`)
    files.set(note.id, tracked.file)
  }
  await writePersistedJson(buildPersistedWorkspace(data, files))
}

async function persistWorkspace(data: WorkspaceData): Promise<void> {
  const safe = sanitizeWorkspace(data)
  const plans = planNoteFiles(safe.notes)

  for (const plan of plans) {
    const sameFile = plan.previous?.file === plan.file
    const sameContent = plan.previous?.content === plan.note.content
    if (!sameFile || !sameContent || !noteFileExists(plan.file)) {
      await writeNoteFile(plan.file, plan.note.content)
    }
  }

  const nextTracked = new Map<string, TrackedNote>()
  const files = new Map<string, string>()
  for (const plan of plans) {
    nextTracked.set(plan.note.id, {
      file: plan.file,
      title: plan.note.title,
      content: plan.note.content
    })
    files.set(plan.note.id, plan.file)
  }

  await writePersistedJson(buildPersistedWorkspace(safe, files))

  const targets = new Set(plans.map((plan) => fileKey(plan.file)))
  for (const tracked of trackedNotes.values()) {
    if (targets.has(fileKey(tracked.file))) continue
    await removeNoteFile(tracked.file).catch((error) => {
      console.warn('[workbench] could not remove old note file:', error)
    })
  }

  trackedNotes.clear()
  for (const [id, tracked] of nextTracked) trackedNotes.set(id, tracked)
}

let writeQueue: Promise<void> = Promise.resolve()

export function queueWorkspaceSave(input: unknown): Promise<void> {
  const safe = sanitizeWorkspace(input)
  // A failed write must not poison every future write in the session.
  const write = writeQueue.catch(() => undefined).then(() => persistWorkspace(safe)).catch((error) => {
    console.error('[workbench] workspace save failed:', error)
    throw error
  })
  writeQueue = write
  return write
}

function writePersistedJsonSync(persisted: PersistedWorkspace): void {
  const file = dataFile()
  const temp = `${file}.${process.pid}.tmp`
  const serialized = JSON.stringify(persisted, null, 2)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(temp, serialized, 'utf8')
  if (existsSync(file)) {
    try {
      renameSync(temp, file)
    } catch {
      writeFileSync(file, serialized, 'utf8')
    }
  } else {
    renameSync(temp, file)
  }
}

/** Used only from the synchronous close/unload path. */
export function flushWorkspaceSync(input: unknown): void {
  try {
    const safe = sanitizeWorkspace(input)
    const plans = planNoteFiles(safe.notes)

    for (const plan of plans) {
      const sameFile = plan.previous?.file === plan.file
      const sameContent = plan.previous?.content === plan.note.content
      if (!sameFile || !sameContent || !noteFileExists(plan.file)) {
        writeNoteFileSync(plan.file, plan.note.content)
      }
    }

    const nextTracked = new Map<string, TrackedNote>()
    const files = new Map<string, string>()
    for (const plan of plans) {
      nextTracked.set(plan.note.id, {
        file: plan.file,
        title: plan.note.title,
        content: plan.note.content
      })
      files.set(plan.note.id, plan.file)
    }

    writePersistedJsonSync(buildPersistedWorkspace(safe, files))

    const targets = new Set(plans.map((plan) => fileKey(plan.file)))
    for (const tracked of trackedNotes.values()) {
      if (targets.has(fileKey(tracked.file))) continue
      try {
        removeNoteFileSync(tracked.file)
      } catch (error) {
        console.warn('[workbench] could not remove old note file:', error)
      }
    }

    trackedNotes.clear()
    for (const [id, tracked] of nextTracked) trackedNotes.set(id, tracked)
  } catch (error) {
    console.error('[workbench] synchronous flush failed:', error)
  }
}
