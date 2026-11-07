export type SectionId = 'overview' | 'todos' | 'links' | 'notes'

export interface Todo {
  id: string
  title: string
  done: boolean
  createdAt: string
  completedAt: string | null
}

export interface QuickLink {
  id: string
  title: string
  url: string
  /** `null` means the operating system's default browser. */
  browserId: string | null
  createdAt: string
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

export type SaveState = 'loading' | 'saving' | 'saved' | 'error'
