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
import { DEFAULT_TODO_PRIORITY, type TodoPriority } from '@shared/priorities'
import type { QuickLink, QuickLinkGroup, QuickLinkInput, SaveState, WorkspaceData } from '@shared/types'
import { createId } from '../lib/id'
import { desktop } from '../services/desktop'

type WorkspaceAction =
  | { type: 'hydrate'; data: WorkspaceData }
  | { type: 'todo/add'; todo: WorkspaceData['todos'][number] }
  | { type: 'todo/toggle'; id: string; now: string }
  | { type: 'todo/rename'; id: string; title: string }
  | { type: 'todo/priority'; id: string; priority: TodoPriority }
  | { type: 'todo/reorder'; id: string; targetId: string; position: 'before' | 'after' }
  | { type: 'todo/remove'; id: string }
  | { type: 'todo/clearCompleted' }
  | { type: 'link/add'; link: QuickLink }
  | { type: 'link/update'; id: string; input: QuickLinkInput }
  | { type: 'link/remove'; id: string }
  | {
      type: 'link/reorder'
      id: string
      targetId: string | null
      position: 'before' | 'after'
      groupId: string | null
    }
  | { type: 'linkGroup/add'; group: QuickLinkGroup }
  | { type: 'linkGroup/rename'; id: string; name: string }
  | { type: 'linkGroup/remove'; id: string }
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
    case 'todo/priority':
      return {
        ...state,
        todos: state.todos.map((todo) =>
          todo.id === action.id ? { ...todo, priority: action.priority } : todo
        )
      }
    case 'todo/reorder': {
      if (action.id === action.targetId) return state
      const moving = state.todos.find((todo) => todo.id === action.id)
      const target = state.todos.find((todo) => todo.id === action.targetId)
      if (!moving || !target || moving.priority !== target.priority) return state

      const remaining = state.todos.filter((todo) => todo.id !== action.id)
      const targetIndex = remaining.findIndex((todo) => todo.id === action.targetId)
      if (targetIndex < 0) return state
      const insertAt = action.position === 'before' ? targetIndex : targetIndex + 1
      return {
        ...state,
        todos: [...remaining.slice(0, insertAt), moving, ...remaining.slice(insertAt)]
      }
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
                browserId: action.input.browserId,
                groupId: action.input.groupId
              }
            : link
        )
      }
    case 'link/remove':
      return { ...state, links: state.links.filter((link) => link.id !== action.id) }
    case 'link/reorder': {
      const moving = state.links.find((link) => link.id === action.id)
      if (!moving || moving.id === action.targetId) return state

      const remaining = state.links.filter((link) => link.id !== action.id)
      let insertAt: number

      if (action.targetId) {
        const targetIndex = remaining.findIndex((link) => link.id === action.targetId)
        if (targetIndex < 0 || remaining[targetIndex].groupId !== action.groupId) return state
        insertAt = action.position === 'before' ? targetIndex : targetIndex + 1
      } else {
        // Dropped onto the group itself: append after that group's last card.
        let lastIndex = -1
        remaining.forEach((link, index) => {
          if (link.groupId === action.groupId) lastIndex = index
        })
        insertAt = lastIndex < 0 ? remaining.length : lastIndex + 1
      }

      const updated = moving.groupId === action.groupId ? moving : { ...moving, groupId: action.groupId }
      const links = [...remaining.slice(0, insertAt), updated, ...remaining.slice(insertAt)]
      return links.every((link, index) => link === state.links[index]) ? state : { ...state, links }
    }
    case 'linkGroup/add':
      return { ...state, linkGroups: [...state.linkGroups, action.group] }
    case 'linkGroup/rename':
      return {
        ...state,
        linkGroups: state.linkGroups.map((group) =>
          group.id === action.id ? { ...group, name: action.name } : group
        )
      }
    case 'linkGroup/remove':
      return {
        ...state,
        linkGroups: state.linkGroups.filter((group) => group.id !== action.id),
        // Keep the links themselves; only their grouping is dissolved.
        links: state.links.map((link) =>
          link.groupId === action.id ? { ...link, groupId: null } : link
        )
      }
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
  addTodo: (title: string, priority?: TodoPriority) => boolean
  toggleTodo: (id: string) => void
  renameTodo: (id: string, title: string) => void
  setTodoPriority: (id: string, priority: TodoPriority) => void
  reorderTodo: (id: string, targetId: string, position: 'before' | 'after') => void
  removeTodo: (id: string) => void
  clearCompleted: () => void
  addLink: (input: QuickLinkInput) => void
  updateLink: (id: string, input: QuickLinkInput) => void
  removeLink: (id: string) => void
  reorderLink: (
    id: string,
    targetId: string | null,
    position: 'before' | 'after',
    groupId: string | null
  ) => void
  addLinkGroup: (name: string) => string | null
  renameLinkGroup: (id: string, name: string) => void
  removeLinkGroup: (id: string) => void
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

  const addTodo = useCallback((title: string, priority: TodoPriority = DEFAULT_TODO_PRIORITY): boolean => {
    const clean = title.trim()
    if (!clean) return false
    dispatch({
      type: 'todo/add',
      todo: {
        id: createId('todo'),
        title: clean.slice(0, 500),
        done: false,
        priority,
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

  const setTodoPriority = useCallback((id: string, priority: TodoPriority): void => {
    dispatch({ type: 'todo/priority', id, priority })
  }, [])

  const reorderTodo = useCallback(
    (id: string, targetId: string, position: 'before' | 'after'): void => {
      dispatch({ type: 'todo/reorder', id, targetId, position })
    },
    []
  )

  const removeTodo = useCallback((id: string): void => {
    dispatch({ type: 'todo/remove', id })
  }, [])

  const clearCompleted = useCallback((): void => {
    dispatch({ type: 'todo/clearCompleted' })
  }, [])

  const addLink = useCallback((input: QuickLinkInput): void => {
    dispatch({
      type: 'link/add',
      link: {
        id: createId('link'),
        title: input.title.slice(0, 200),
        url: input.url,
        browserId: input.browserId,
        groupId: input.groupId,
        createdAt: new Date().toISOString()
      }
    })
  }, [])

  const updateLink = useCallback((id: string, input: QuickLinkInput): void => {
    dispatch({ type: 'link/update', id, input })
  }, [])

  const removeLink = useCallback((id: string): void => {
    dispatch({ type: 'link/remove', id })
  }, [])

  const reorderLink = useCallback(
    (id: string, targetId: string | null, position: 'before' | 'after', groupId: string | null): void => {
      dispatch({ type: 'link/reorder', id, targetId, position, groupId })
    },
    []
  )

  const addLinkGroup = useCallback((name: string): string | null => {
    const clean = name.trim().slice(0, 60)
    if (!clean) return null
    const id = createId('link-group')
    dispatch({
      type: 'linkGroup/add',
      group: { id, name: clean, createdAt: new Date().toISOString() }
    })
    return id
  }, [])

  const renameLinkGroup = useCallback((id: string, name: string): void => {
    const clean = name.trim().slice(0, 60)
    if (!clean) return
    dispatch({ type: 'linkGroup/rename', id, name: clean })
  }, [])

  const removeLinkGroup = useCallback((id: string): void => {
    dispatch({ type: 'linkGroup/remove', id })
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
      setTodoPriority,
      reorderTodo,
      removeTodo,
      clearCompleted,
      addLink,
      updateLink,
      removeLink,
      reorderLink,
      addLinkGroup,
      renameLinkGroup,
      removeLinkGroup,
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
      setTodoPriority,
      reorderTodo,
      removeTodo,
      clearCompleted,
      addLink,
      updateLink,
      removeLink,
      reorderLink,
      addLinkGroup,
      renameLinkGroup,
      removeLinkGroup,
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
