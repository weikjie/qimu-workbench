import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { EMPTY_WORKSPACE } from '@shared/defaults'
import type { QuickLink, SaveState, WorkspaceData } from '@shared/types'
import { createId } from '../lib/id'
import { desktop } from '../services/desktop'

interface AddLinkInput {
  title: string
  url: string
  browserId: string | null
}

type WorkspaceAction =
  | { type: 'hydrate'; data: WorkspaceData }
  | { type: 'todo/add'; todo: WorkspaceData['todos'][number] }
  | { type: 'todo/toggle'; id: string; now: string }
  | { type: 'todo/rename'; id: string; title: string }
  | { type: 'todo/remove'; id: string }
  | { type: 'todo/clearCompleted' }
  | { type: 'link/add'; link: QuickLink }
  | { type: 'link/update'; id: string; input: AddLinkInput }
  | { type: 'link/remove'; id: string }
  | { type: 'note/add'; id: string; now: string }
  | { type: 'note/update'; id: string; patch: { title?: string; content?: string }; now: string }
  | { type: 'note/remove'; id: string }

function reducer(state: WorkspaceData, action: WorkspaceAction): WorkspaceData {
  switch (action.type) {
    case 'hydrate':
      return action.data
    case 'todo/add':
      return { ...state, todos: [action.todo, ...state.todos] }
    case 'todo/toggle':
      return {
        ...state,
        todos: state.todos.map((todo) =>
          todo.id === action.id
            ? { ...todo, done: !todo.done, completedAt: todo.done ? null : action.now }
            : todo
        )
      }
    case 'todo/rename':
      return {
        ...state,
        todos: state.todos.map((todo) => (todo.id === action.id ? { ...todo, title: action.title } : todo))
      }
    case 'todo/remove':
      return { ...state, todos: state.todos.filter((todo) => todo.id !== action.id) }
    case 'todo/clearCompleted':
      return { ...state, todos: state.todos.filter((todo) => !todo.done) }
    case 'link/add':
      return { ...state, links: [action.link, ...state.links] }
    case 'link/update':
      return {
        ...state,
        links: state.links.map((link) =>
          link.id === action.id
            ? {
                ...link,
                title: action.input.title,
                url: action.input.url,
                browserId: action.input.browserId
              }
            : link
        )
      }
    case 'link/remove':
      return { ...state, links: state.links.filter((link) => link.id !== action.id) }
    case 'note/add': {
      const note = {
        id: action.id,
        title: '未命名笔记',
        content: '',
        createdAt: action.now,
        updatedAt: action.now
      }
      return { ...state, notes: [note, ...state.notes] }
    }
    case 'note/update':
      return {
        ...state,
        notes: state.notes.map((note) =>
          note.id === action.id
            ? {
                ...note,
                ...action.patch,
                updatedAt: action.now
              }
            : note
        )
      }
    case 'note/remove':
      return { ...state, notes: state.notes.filter((note) => note.id !== action.id) }
    default:
      return state
  }
}

interface WorkspaceContextValue {
  data: WorkspaceData
  ready: boolean
  saveState: SaveState
  loadError: string | null
  addTodo: (title: string) => boolean
  toggleTodo: (id: string) => void
  renameTodo: (id: string, title: string) => void
  removeTodo: (id: string) => void
  clearCompleted: () => void
  addLink: (input: AddLinkInput) => void
  updateLink: (id: string, input: AddLinkInput) => void
  removeLink: (id: string) => void
  addNote: () => string
  updateNote: (id: string, patch: { title?: string; content?: string }) => void
  removeNote: (id: string) => void
  saveNow: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

const AUTOSAVE_DELAY = 380

export function WorkspaceProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [data, dispatch] = useReducer(reducer, EMPTY_WORKSPACE)
  const [ready, setReady] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const latestData = useRef(data)
  const saveTimer = useRef<number | null>(null)
  const saveSequence = useRef(0)

  // Keep the ref current during render so the synchronous close flush always
  // sees the newest state, even if an effect has not had a chance to run.
  latestData.current = data

  const persist = useCallback(async (snapshot: WorkspaceData): Promise<void> => {
    const sequence = ++saveSequence.current
    setSaveState('saving')
    try {
      await desktop.saveWorkspace(snapshot)
      if (sequence === saveSequence.current) setSaveState('saved')
    } catch (error) {
      console.error('Unable to save workspace:', error)
      if (sequence === saveSequence.current) setSaveState('error')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    desktop
      .loadWorkspace()
      .then((loaded) => {
        if (cancelled) return
        dispatch({ type: 'hydrate', data: loaded })
        setReady(true)
        setSaveState('saved')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        console.error('Unable to load workspace:', error)
        setLoadError(error instanceof Error ? error.message : '无法读取本地数据')
        setReady(true)
        setSaveState('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    setSaveState('saving')
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    const snapshot = data
    saveTimer.current = window.setTimeout(() => {
      void persist(snapshot)
    }, AUTOSAVE_DELAY)

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [data, ready, persist])

  useEffect(() => {
    const flush = (): void => {
      try {
        desktop.flushWorkspace(latestData.current)
      } catch (error) {
        console.error('Unable to flush workspace:', error)
      }
    }
    // beforeunload is the reliable path when the Electron window is closed
    // from the title bar; pagehide covers renderer teardown and navigation.
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  const saveNow = useCallback(async (): Promise<void> => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    await persist(latestData.current)
  }, [persist])

  const addTodo = useCallback((title: string): boolean => {
    const clean = title.trim()
    if (!clean) return false
    dispatch({
      type: 'todo/add',
      todo: {
        id: createId('todo'),
        title: clean.slice(0, 500),
        done: false,
        createdAt: new Date().toISOString(),
        completedAt: null
      }
    })
    return true
  }, [])

  const toggleTodo = useCallback((id: string): void => {
    dispatch({ type: 'todo/toggle', id, now: new Date().toISOString() })
  }, [])

  const renameTodo = useCallback((id: string, title: string): void => {
    const clean = title.trim()
    if (!clean) return
    dispatch({ type: 'todo/rename', id, title: clean.slice(0, 500) })
  }, [])

  const removeTodo = useCallback((id: string): void => {
    dispatch({ type: 'todo/remove', id })
  }, [])

  const clearCompleted = useCallback((): void => {
    dispatch({ type: 'todo/clearCompleted' })
  }, [])

  const addLink = useCallback((input: AddLinkInput): void => {
    dispatch({
      type: 'link/add',
      link: {
        id: createId('link'),
        title: input.title.slice(0, 200),
        url: input.url,
        browserId: input.browserId,
        createdAt: new Date().toISOString()
      }
    })
  }, [])

  const updateLink = useCallback((id: string, input: AddLinkInput): void => {
    dispatch({ type: 'link/update', id, input })
  }, [])

  const removeLink = useCallback((id: string): void => {
    dispatch({ type: 'link/remove', id })
  }, [])

  const addNote = useCallback((): string => {
    const id = createId('note')
    dispatch({ type: 'note/add', id, now: new Date().toISOString() })
    return id
  }, [])

  const updateNote = useCallback((id: string, patch: { title?: string; content?: string }): void => {
    dispatch({ type: 'note/update', id, patch, now: new Date().toISOString() })
  }, [])

  const removeNote = useCallback((id: string): void => {
    dispatch({ type: 'note/remove', id })
  }, [])

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      data,
      ready,
      saveState,
      loadError,
      addTodo,
      toggleTodo,
      renameTodo,
      removeTodo,
      clearCompleted,
      addLink,
      updateLink,
      removeLink,
      addNote,
      updateNote,
      removeNote,
      saveNow
    }),
    [
      data,
      ready,
      saveState,
      loadError,
      addTodo,
      toggleTodo,
      renameTodo,
      removeTodo,
      clearCompleted,
      addLink,
      updateLink,
      removeLink,
      addNote,
      updateNote,
      removeNote,
      saveNow
    ]
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('useWorkspace must be used within a WorkspaceProvider')
  return context
}
