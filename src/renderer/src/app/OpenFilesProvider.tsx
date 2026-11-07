import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type { ExternalFileOpenRequest, ExternalMarkdownDocument, SaveState } from '@shared/types'
import { useToast } from '../components/ui/Toast'
import { desktop } from '../services/desktop'

export interface OpenMarkdownFile extends ExternalMarkdownDocument {
  saveState: SaveState
  dirty: boolean
}

interface OpenFilesContextValue {
  files: OpenMarkdownFile[]
  activeFileId: string | null
  activeFile: OpenMarkdownFile | null
  /** Increments whenever a new file is opened, so the shell can switch views. */
  focusTick: number
  selectFile: (id: string | null) => void
  updateFileContent: (id: string, content: string) => void
  saveFile: (id: string) => Promise<boolean>
  closeFile: (id: string) => Promise<void>
}

const OpenFilesContext = createContext<OpenFilesContextValue | null>(null)
const FILE_SAVE_DELAY = 420

export function OpenFilesProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { notify } = useToast()
  const [files, setFiles] = useState<OpenMarkdownFile[]>([])
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const filesRef = useRef(files)
  const saveTimers = useRef(new Map<string, number>())
  const saveSequences = useRef(new Map<string, number>())

  filesRef.current = files

  const updateSaveState = useCallback((id: string, patch: Partial<OpenMarkdownFile>): void => {
    setFiles((current) => current.map((file) => (file.id === id ? { ...file, ...patch } : file)))
  }, [])

  const persist = useCallback(
    async (id: string, content: string): Promise<boolean> => {
      const sequence = (saveSequences.current.get(id) ?? 0) + 1
      saveSequences.current.set(id, sequence)
      updateSaveState(id, { saveState: 'saving' })

      try {
        const result = await desktop.saveOpenFile(id, content)
        if (saveSequences.current.get(id) !== sequence) return result.ok

        if (!result.ok) {
          updateSaveState(id, { saveState: 'error' })
          notify(result.message ?? '文件保存失败。', 'error')
          return false
        }

        setFiles((current) =>
          current.map((file) => {
            if (file.id !== id) return file
            const unchanged = file.content === content
            return {
              ...file,
              saveState: unchanged ? 'saved' : 'saving',
              dirty: !unchanged,
              modifiedAt: result.modifiedAt ?? file.modifiedAt
            }
          })
        )
        return true
      } catch (error) {
        console.error('Unable to save markdown file:', error)
        if (saveSequences.current.get(id) === sequence) {
          updateSaveState(id, { saveState: 'error' })
          notify('文件保存失败，请稍后重试。', 'error')
        }
        return false
      }
    },
    [notify, updateSaveState]
  )

  const ingest = useCallback(
    (request: ExternalFileOpenRequest): void => {
      if (!request.ok) {
        notify(request.message, 'error')
        return
      }

      const document = request.document
      const existing = filesRef.current.find((file) => file.id === document.id)
      if (existing?.dirty) {
        setActiveFileId(document.id)
        setFocusTick((tick) => tick + 1)
        notify(`「${document.name}」已在工作台打开，当前修改已保留。`, 'info')
        return
      }

      const next: OpenMarkdownFile = {
        ...document,
        saveState: 'saved',
        dirty: false
      }
      setFiles((current) => {
        if (current.some((file) => file.id === next.id)) {
          return current.map((file) => (file.id === next.id ? next : file))
        }
        return [next, ...current]
      })
      setActiveFileId(next.id)
      setFocusTick((tick) => tick + 1)
    },
    [notify]
  )

  const drainOpenRequests = useCallback(async (): Promise<void> => {
    try {
      const requests = await desktop.takeOpenFileRequests()
      for (const request of requests) ingest(request)
    } catch (error) {
      console.error('Unable to read opened markdown files:', error)
      notify('无法读取从系统打开的 Markdown 文件。', 'error')
    }
  }, [ingest, notify])

  useEffect(() => {
    const unsubscribe = desktop.onOpenFilesAvailable(() => {
      void drainOpenRequests()
    })
    void drainOpenRequests()
    return unsubscribe
  }, [drainOpenRequests])

  useEffect(() => {
    const flush = (): void => {
      const dirty = filesRef.current.filter((file) => file.dirty)
      if (dirty.length === 0) return
      try {
        desktop.flushOpenFiles(dirty.map((file) => ({ id: file.id, content: file.content })))
      } catch (error) {
        console.error('Unable to flush markdown files:', error)
      }
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  const selectFile = useCallback((id: string | null): void => {
    setActiveFileId(id)
  }, [])

  const updateFileContent = useCallback(
    (id: string, content: string): void => {
      updateSaveState(id, { content, dirty: true, saveState: 'saving' })
      const timer = saveTimers.current.get(id)
      if (timer) window.clearTimeout(timer)
      saveTimers.current.set(
        id,
        window.setTimeout(() => {
          saveTimers.current.delete(id)
          void persist(id, content)
        }, FILE_SAVE_DELAY)
      )
    },
    [persist, updateSaveState]
  )

  const saveFile = useCallback(
    async (id: string): Promise<boolean> => {
      const timer = saveTimers.current.get(id)
      if (timer) {
        window.clearTimeout(timer)
        saveTimers.current.delete(id)
      }
      const file = filesRef.current.find((item) => item.id === id)
      if (!file) return false
      return persist(id, file.content)
    },
    [persist]
  )

  const closeFile = useCallback(
    async (id: string): Promise<void> => {
      const timer = saveTimers.current.get(id)
      if (timer) {
        window.clearTimeout(timer)
        saveTimers.current.delete(id)
      }

      const file = filesRef.current.find((item) => item.id === id)
      if (!file) return
      if (file.dirty) {
        const saved = await persist(id, file.content)
        if (!saved) return
      }

      desktop.closeOpenFile(id)
      setFiles((current) => current.filter((item) => item.id !== id))
      setActiveFileId((current) => (current === id ? null : current))
    },
    [persist]
  )

  const activeFile = files.find((file) => file.id === activeFileId) ?? null

  const value = useMemo<OpenFilesContextValue>(
    () => ({
      files,
      activeFileId,
      activeFile,
      focusTick,
      selectFile,
      updateFileContent,
      saveFile,
      closeFile
    }),
    [
      files,
      activeFileId,
      activeFile,
      focusTick,
      selectFile,
      updateFileContent,
      saveFile,
      closeFile
    ]
  )

  return <OpenFilesContext.Provider value={value}>{children}</OpenFilesContext.Provider>
}

export function useOpenFiles(): OpenFilesContextValue {
  const context = useContext(OpenFilesContext)
  if (!context) throw new Error('useOpenFiles must be used within an OpenFilesProvider')
  return context
}
