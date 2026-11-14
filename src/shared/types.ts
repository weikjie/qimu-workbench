import type { TodoPriority } from './priorities'

export type SectionId = 'overview' | 'todos' | 'links' | 'notes'

export interface Todo {
  id: string
  title: string
  done: boolean
  priority: TodoPriority
  createdAt: string
  completedAt: string | null
}

export interface QuickLinkGroup {
  id: string
  name: string
  createdAt: string
}

export interface QuickLink {
  id: string
  title: string
  url: string
  /** `null` means the operating system's default browser. */
  browserId: string | null
  /** `null` means the link does not belong to any group. */
  groupId: string | null
  createdAt: string
}

/** Values edited in the quick-link dialog. */
export interface QuickLinkInput {
  title: string
  url: string
  browserId: string | null
  groupId: string | null
}

export interface MarkdownNote {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface WorkspaceData {
  version: 1
  todos: Todo[]
  links: QuickLink[]
  linkGroups: QuickLinkGroup[]
  notes: MarkdownNote[]
}

export interface BrowserInfo {
  id: string
  name: string
  family: 'chromium' | 'firefox' | 'other'
}

export interface OpenResult {
  ok: boolean
  message?: string
}

/** A Markdown document opened from Windows (or the command line). */
export interface ExternalMarkdownDocument {
  id: string
  /** File name including the extension. */
  name: string
  /** Absolute path, shown in the editor for context. */
  path: string
  content: string
  modifiedAt: string
}

export type ExternalFileOpenRequest =
  | { ok: true; document: ExternalMarkdownDocument }
  | { ok: false; message: string }

export interface ExternalFileSaveResult extends OpenResult {
  modifiedAt?: string
}

export interface ExternalFileFlushInput {
  id: string
  content: string
}

/** Where a pasted image belongs: a built-in note or a Markdown file opened
 * from the operating system. */
export type PastedImageTarget = 'note' | 'file'

export interface SavePastedImageInput {
  target: PastedImageTarget
  /** A note ID for `note`, or an open-document ID for `file`. */
  id: string
  data: ArrayBuffer
}

export interface SavePastedImageResult extends OpenResult {
  /** Image path relative to the note or Markdown file, using `/` separators. */
  relativePath?: string
  fileName?: string
}

export type SaveState = 'loading' | 'saving' | 'saved' | 'error'
