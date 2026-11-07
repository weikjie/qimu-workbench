import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Columns2,
  Eye,
  FileText,
  FolderOpen,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react'
import { createExternalAssetUrl } from '@shared/assets'
import type { MarkdownNote } from '@shared/types'
import { useOpenFiles } from '../../app/OpenFilesProvider'
import { useWorkspace } from '../../app/WorkspaceProvider'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconButton } from '../../components/ui/IconButton'
import { Segmented, type SegmentedOption } from '../../components/ui/Segmented'
import { useToast } from '../../components/ui/Toast'
import { countCharacters, formatRelativeTime } from '../../lib/format'
import { getExcerpt, renderMarkdown } from '../../lib/markdown'
import { desktop } from '../../services/desktop'
import { MarkdownToolbar } from './MarkdownToolbar'
import './notes.css'

type EditorMode = 'edit' | 'split' | 'preview'

const RAIL_PREFERENCE_KEY = 'qimu.notes.railCollapsed'

function readRailPreference(): boolean {
  try {
    return window.localStorage.getItem(RAIL_PREFERENCE_KEY) === 'true'
  } catch {
    return false
  }
}

const MODE_OPTIONS: ReadonlyArray<SegmentedOption<EditorMode>> = [
  { value: 'edit', label: '编辑', icon: <PencilLine size={13} /> },
  { value: 'split', label: '双栏', icon: <Columns2 size={13} /> },
  { value: 'preview', label: '预览', icon: <Eye size={13} /> }
]

export function NotesView(): React.JSX.Element {
  const { data, saveState, addNote, updateNote, removeNote, saveNow } = useWorkspace()
  const {
    files: openFiles,
    activeFile,
    activeFileId,
    selectFile,
    updateFileContent,
    saveFile,
    closeFile
  } = useOpenFiles()
  const { notify } = useToast()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<EditorMode>('split')
  const [railCollapsed, setRailCollapsed] = useState(readRailPreference)
  const [deleteTarget, setDeleteTarget] = useState<MarkdownNote | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const selectionRef = useRef({ start: 0, end: 0 })
  const focusTitleOnNext = useRef(false)

  const sortedNotes = useMemo(
    () => [...data.notes].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [data.notes]
  )

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return sortedNotes
    return sortedNotes.filter(
      (note) => note.title.toLowerCase().includes(query) || note.content.toLowerCase().includes(query)
    )
  }, [search, sortedNotes])

  const filteredOpenFiles = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return openFiles
    return openFiles.filter(
      (file) =>
        file.name.toLowerCase().includes(query) ||
        file.path.toLowerCase().includes(query) ||
        file.content.toLowerCase().includes(query)
    )
  }, [openFiles, search])

  useEffect(() => {
    if (sortedNotes.length === 0) {
      if (activeId !== null) setActiveId(null)
      return
    }
    if (!activeId || !sortedNotes.some((note) => note.id === activeId)) {
      setActiveId(sortedNotes[0]?.id ?? null)
    }
  }, [sortedNotes, activeId])

  useEffect(() => {
    if (!focusTitleOnNext.current) return
    focusTitleOnNext.current = false
    const timer = window.setTimeout(() => {
      titleRef.current?.focus()
      titleRef.current?.select()
    }, 50)
    return () => window.clearTimeout(timer)
  }, [activeId])

  const activeNote = data.notes.find((note) => note.id === activeId) ?? sortedNotes[0] ?? null
  const currentContent = activeFile?.content ?? activeNote?.content ?? ''
  const previewFileId = activeFile?.id ?? null

  // Closing the last visible document should fall back to another open file
  // when the note library itself is empty.
  useEffect(() => {
    if (activeFileId || openFiles.length === 0 || activeNote) return
    selectFile(openFiles[0]?.id ?? null)
  }, [activeFileId, openFiles, activeNote, selectFile])

  const deferredContent = useDeferredValue(currentContent)
  const previewHtml = useMemo(
    () =>
      renderMarkdown(
        deferredContent,
        previewFileId
          ? { resolveImageSource: (source) => createExternalAssetUrl(previewFileId, source) }
          : undefined
      ),
    [deferredContent, previewFileId]
  )
  const characterCount = countCharacters(currentContent)
  const lineCount = currentContent ? currentContent.split('\n').length : 0
  const currentSaveState = activeFile?.saveState ?? saveState

  function selectNote(noteId: string): void {
    selectFile(null)
    setActiveId(noteId)
    selectionRef.current = { start: 0, end: 0 }
  }

  function selectOpenFile(fileId: string): void {
    selectFile(fileId)
    selectionRef.current = { start: 0, end: 0 }
  }

  function commitContent(next: string): void {
    if (activeFile) {
      updateFileContent(activeFile.id, next)
    } else if (activeNote) {
      updateNote(activeNote.id, { content: next })
    }
  }

  function toggleRail(): void {
    const next = !railCollapsed
    setRailCollapsed(next)
    try {
      window.localStorage.setItem(RAIL_PREFERENCE_KEY, String(next))
    } catch {
      // A blocked localStorage should not prevent collapsing the sidebar.
    }
  }

  function createNote(): void {
    const id = addNote()
    selectFile(null)
    setSearch('')
    setActiveId(id)
    setMode('edit')
    focusTitleOnNext.current = true
  }

  function rememberSelection(): void {
    const textarea = textareaRef.current
    if (!textarea) return
    selectionRef.current = { start: textarea.selectionStart, end: textarea.selectionEnd }
  }

  function applyWrap(before: string, after: string, placeholder: string): void {
    if (!activeFile && !activeNote) return
    const content = currentContent
    const textarea = textareaRef.current
    const start = Math.min(textarea?.selectionStart ?? selectionRef.current.start, content.length)
    const end = Math.min(textarea?.selectionEnd ?? selectionRef.current.end, content.length)
    const selected = content.slice(start, end)
    const inner = selected || placeholder
    const next = `${content.slice(0, start)}${before}${inner}${after}${content.slice(end)}`
    commitContent(next)
    const nextStart = start + before.length
    const nextEnd = nextStart + inner.length
    selectionRef.current = { start: nextStart, end: nextEnd }
    window.requestAnimationFrame(() => {
      const target = textareaRef.current
      if (!target) return
      target.focus()
      target.setSelectionRange(nextStart, nextEnd)
    })
  }

  function applyPrefix(prefix: string): void {
    if (!activeFile && !activeNote) return
    const content = currentContent
    const textarea = textareaRef.current
    const start = Math.min(textarea?.selectionStart ?? selectionRef.current.start, content.length)
    const end = Math.min(textarea?.selectionEnd ?? selectionRef.current.end, content.length)
    const lineStart = content.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const lineBreak = content.indexOf('\n', end)
    const lineEnd = lineBreak === -1 ? content.length : lineBreak
    const segment = content.slice(lineStart, lineEnd)
    const lineCountInSelection = segment.split('\n').length
    const updatedSegment = segment
      .split('\n')
      .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
      .join('\n')
    const next = `${content.slice(0, lineStart)}${updatedSegment}${content.slice(lineEnd)}`
    commitContent(next)
    const nextStart = start + prefix.length
    const nextEnd = end + prefix.length * lineCountInSelection
    selectionRef.current = { start: nextStart, end: nextEnd }
    window.requestAnimationFrame(() => {
      const target = textareaRef.current
      if (!target) return
      target.focus()
      target.setSelectionRange(nextStart, nextEnd)
    })
  }

  function insertTab(): void {
    if (!activeFile && !activeNote) return
    const content = currentContent
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? content.length
    const end = textarea?.selectionEnd ?? content.length
    const next = `${content.slice(0, start)}  ${content.slice(end)}`
    commitContent(next)
    const position = start + 2
    selectionRef.current = { start: position, end: position }
    window.requestAnimationFrame(() => {
      const target = textareaRef.current
      target?.focus()
      target?.setSelectionRange(position, position)
    })
  }

  function handleEditorKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      if (activeFile) {
        void saveFile(activeFile.id)
      } else {
        void saveNow()
      }
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault()
      applyWrap('**', '**', '加粗文字')
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'i') {
      event.preventDefault()
      applyWrap('*', '*', '斜体文字')
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      insertTab()
    }
  }

  function handlePreviewClick(event: React.MouseEvent<HTMLDivElement>): void {
    const anchor = (event.target as HTMLElement).closest('a')
    if (!anchor) return
    event.preventDefault()
    const href = anchor.getAttribute('href')
    if (!href || !/^https?:\/\//i.test(href)) return

    void desktop.openExternal(href).then((result) => {
      if (!result.ok) notify(result.message ?? '暂时无法打开这个链接。', 'error')
    })
  }

  function confirmDelete(): void {
    if (!deleteTarget) return
    const deletedId = deleteTarget.id
    removeNote(deletedId)
    if (activeId === deletedId) setActiveId(null)
    notify('笔记已删除', 'success')
  }

  function openNotesFolder(): void {
    void desktop.openNotesFolder().then((result) => {
      if (!result.ok) notify(result.message ?? '暂时无法打开笔记文件夹。', 'error')
    })
  }

  return (
    <div className="notes-page">
      {data.notes.length === 0 && openFiles.length === 0 ? (
        <div className="notes-empty-screen">
          <EmptyState
            icon={<FileText size={25} strokeWidth={1.65} />}
            title="还没有笔记"
            description="从一页空白开始，写下一个想法、一段摘录，或今天的天气。Markdown 会让它更有层次。"
            action={
              <Button variant="soft" icon={<Plus size={15} />} onClick={createNote}>
                新建第一篇笔记
              </Button>
            }
          />
        </div>
      ) : (
        <div className={`notes-workbench${railCollapsed ? ' is-rail-collapsed' : ''}`}>
          <aside className="note-rail" aria-label="笔记与文件列表" aria-hidden={railCollapsed}>
            <div className="note-rail__top">
              <div className="note-rail__heading">
                <span className="note-rail__name">笔记库</span>
                <span className="note-rail__count">{data.notes.length + openFiles.length}</span>
              </div>
              <IconButton
                label="收起笔记列表"
                icon={<PanelLeftClose size={17} />}
                onClick={toggleRail}
              />
            </div>

            <div className="note-rail__search">
              <Search size={14} className="note-rail__search-icon" aria-hidden="true" />
              <input
                value={search}
                placeholder="搜索笔记与文件…"
                aria-label="搜索笔记与文件"
                onChange={(event) => setSearch(event.target.value)}
              />
              {search ? (
                <button
                  type="button"
                  className="note-rail__search-clear"
                  aria-label="清空搜索"
                  onClick={() => setSearch('')}
                >
                  ×
                </button>
              ) : null}
            </div>

            <div className="note-rail__list" role="list" aria-label="笔记与文件列表">
              {filteredOpenFiles.length > 0 ? (
                <div className="note-rail__group">
                  <span className="note-rail__group-label">已打开的文件</span>
                  {filteredOpenFiles.map((file) => (
                    <div
                      key={file.id}
                      className={`note-rail-file${activeFileId === file.id ? ' is-active' : ''}`}
                    >
                      <button
                        type="button"
                        role="listitem"
                        className={`note-rail-item note-rail-item--file${
                          activeFileId === file.id ? ' is-active' : ''
                        }`}
                        title={file.path}
                        onClick={() => selectOpenFile(file.id)}
                      >
                        <span className="note-rail-item__title-row">
                          <FileText
                            size={12}
                            strokeWidth={1.8}
                            className="note-rail-file__icon"
                            aria-hidden="true"
                          />
                          <span className="note-rail-item__title">{file.name}</span>
                          <span className="note-rail-item__time">
                            {file.saveState === 'saving'
                              ? '写入中'
                              : file.saveState === 'error'
                                ? '保存失败'
                                : '本地文件'}
                          </span>
                        </span>
                        <span className="note-rail-item__excerpt">{file.path}</span>
                      </button>
                      <button
                        type="button"
                        className="note-rail-file__close"
                        aria-label={`关闭 ${file.name}`}
                        title="关闭文件"
                        onClick={() => void closeFile(file.id)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {filteredNotes.length > 0 ? (
                <div className="note-rail__group">
                  {openFiles.length > 0 ? <span className="note-rail__group-label">笔记</span> : null}
                  {filteredNotes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      role="listitem"
                      className={`note-rail-item${
                        !activeFile && activeNote?.id === note.id ? ' is-active' : ''
                      }`}
                      onClick={() => selectNote(note.id)}
                    >
                      <span className="note-rail-item__title-row">
                        <span className="note-rail-item__title">{note.title || '无标题笔记'}</span>
                        <span className="note-rail-item__time">
                          {formatRelativeTime(note.updatedAt)}
                        </span>
                      </span>
                      <span className="note-rail-item__excerpt">
                        {getExcerpt(note.content, 78) || '空白笔记'}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {filteredOpenFiles.length === 0 && filteredNotes.length === 0 ? (
                <div className="note-rail__empty">
                  <Search size={19} strokeWidth={1.6} />
                  <p>{search ? '没有找到相关内容' : '还没有笔记'}</p>
                  {search ? (
                    <button type="button" onClick={() => setSearch('')}>
                      清空搜索
                    </button>
                  ) : (
                    <button type="button" onClick={createNote}>
                      新建笔记
                    </button>
                  )}
                </div>
              ) : null}
            </div>

            <div className="note-rail__footer">
              <span>
                {data.notes.length} 篇笔记
                {openFiles.length > 0 ? ` · ${openFiles.length} 个文件` : ''}
              </span>
              <button
                type="button"
                className="note-rail__folder"
                title="打开笔记文件夹"
                onClick={openNotesFolder}
              >
                <FolderOpen size={11} aria-hidden="true" />
                笔记文件夹
              </button>
            </div>
          </aside>

          <section className="note-editor">
            {activeFile || activeNote ? (
              <>
                <header className="note-editor__header">
                  <div className="note-editor__heading">
                    {railCollapsed ? (
                      <IconButton
                        label="展开笔记列表"
                        icon={<PanelLeftOpen size={17} />}
                        className="note-editor__rail-open"
                        onClick={toggleRail}
                      />
                    ) : null}
                    {activeFile ? (
                      <div className="note-editor__title-wrap" title={activeFile.path}>
                        <span className="note-editor__file-title">{activeFile.name}</span>
                        <span className="note-editor__meta note-editor__meta--path">
                          {activeFile.path}
                        </span>
                      </div>
                    ) : activeNote ? (
                      <div className="note-editor__title-wrap">
                        <input
                          ref={titleRef}
                          value={activeNote.title}
                          maxLength={300}
                          className="note-editor__title"
                          placeholder="无标题笔记"
                          aria-label="笔记标题"
                          onChange={(event) => updateNote(activeNote.id, { title: event.target.value })}
                        />
                        <span className="note-editor__meta">
                          编辑于 {formatRelativeTime(activeNote.updatedAt)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="note-editor__actions">
                    <IconButton
                      label="新建笔记"
                      icon={<Plus size={16} />}
                      variant="soft"
                      onClick={createNote}
                    />
                    {activeFile ? (
                      <IconButton
                        label="关闭文件"
                        icon={<X size={16} />}
                        onClick={() => void closeFile(activeFile.id)}
                      />
                    ) : activeNote ? (
                      <IconButton
                        label="删除这篇笔记"
                        icon={<Trash2 size={15} />}
                        variant="danger"
                        onClick={() => setDeleteTarget(activeNote)}
                      />
                    ) : null}
                  </div>
                </header>

                <div className="note-editor__toolbar">
                  <MarkdownToolbar
                    onWrap={applyWrap}
                    onPrefix={applyPrefix}
                    disabled={mode === 'preview'}
                  />
                  <Segmented
                    value={mode}
                    options={MODE_OPTIONS}
                    onChange={setMode}
                    label="编辑视图"
                    compact
                  />
                </div>

                <div className={`note-surface note-surface--${mode}`}>
                  {mode !== 'preview' ? (
                    <div className="editor-pane">
                      <textarea
                        ref={textareaRef}
                        value={currentContent}
                        className="note-textarea"
                        placeholder="从这里开始书写…&#10;&#10;支持 Markdown：用 # 写标题，用 - 写列表，用 > 引用一段话。"
                        aria-label="Markdown 内容"
                        spellCheck={false}
                        onSelect={rememberSelection}
                        onClick={rememberSelection}
                        onKeyUp={rememberSelection}
                        onChange={(event) => {
                          commitContent(event.target.value)
                          rememberSelection()
                        }}
                        onKeyDown={handleEditorKeyDown}
                      />
                    </div>
                  ) : null}

                  {mode !== 'edit' ? (
                    <div className="preview-pane" onClick={handlePreviewClick}>
                      {previewHtml ? (
                        <div
                          className="markdown-body"
                          dangerouslySetInnerHTML={{ __html: previewHtml }}
                        />
                      ) : (
                        <div className="preview-empty">
                          <Eye size={20} strokeWidth={1.55} />
                          <p>预览会在这里出现</p>
                          <span>开始书写，看见文字逐渐成形。</span>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                <footer className="note-editor__footer">
                  <span>{characterCount} 字</span>
                  <span className="note-editor__footer-dot">·</span>
                  <span>{lineCount} 行</span>
                  <span className="note-editor__footer-spacer" />
                  <span
                    className={`note-save-state note-save-state--${currentSaveState}`}
                    aria-live="polite"
                  >
                    {currentSaveState === 'saving' ? (
                      <LoaderCircle size={12} className="spin" />
                    ) : currentSaveState === 'error' ? (
                      <span className="note-save-state__dot is-error" />
                    ) : (
                      <Check size={12} />
                    )}
                    {currentSaveState === 'saving'
                      ? '写入文件'
                      : currentSaveState === 'error'
                        ? '保存失败'
                        : '已保存到文件'}
                  </span>
                  <span className="note-editor__footer-dot">·</span>
                  <span className="note-editor__shortcut">
                    <kbd>Ctrl</kbd> + <kbd>S</kbd> 保存
                  </span>
                </footer>
              </>
            ) : null}
          </section>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除这篇笔记？"
        description={
          deleteTarget
            ? `「${deleteTarget.title || '无标题笔记'}」将从本地移除，这个操作无法撤销。`
            : ''
        }
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
