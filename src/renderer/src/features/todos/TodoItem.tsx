import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import type { Todo } from '@shared/types'
import { formatRelativeTime } from '../../lib/format'
import { IconButton } from '../../components/ui/IconButton'
import { RoundCheckbox } from '../../components/ui/RoundCheckbox'

interface TodoItemProps {
  todo: Todo
  onToggle: () => void
  onRename: (title: string) => void
  onRemove: () => void
}

export function TodoItem({ todo, onToggle, onRename, onRemove }: TodoItemProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(todo.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  function beginEdit(): void {
    setDraft(todo.title)
    setEditing(true)
  }

  function commit(): void {
    const clean = draft.trim()
    if (clean && clean !== todo.title) onRename(clean)
    setEditing(false)
  }

  function cancel(): void {
    setDraft(todo.title)
    setEditing(false)
  }

  return (
    <div className={`todo-item${todo.done ? ' is-done' : ''}${editing ? ' is-editing' : ''}`}>
      <RoundCheckbox
        checked={todo.done}
        onChange={onToggle}
        label={todo.done ? `将「${todo.title}」标记为未完成` : `完成「${todo.title}」`}
      />

      {editing ? (
        <div className="todo-edit">
          <input
            ref={inputRef}
            value={draft}
            maxLength={500}
            aria-label="编辑待办内容"
            className="todo-edit__input"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commit()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                cancel()
              }
            }}
          />
          <div className="todo-edit__actions">
            <IconButton label="保存" icon={<Check size={16} />} variant="soft" size="sm" onClick={commit} />
            <IconButton label="取消编辑" icon={<X size={15} />} size="sm" onClick={cancel} />
          </div>
        </div>
      ) : (
        <>
          <button type="button" className="todo-item__body" onClick={onToggle}>
            <span className="todo-item__title">{todo.title}</span>
            <span className="todo-item__meta">
              {todo.done && todo.completedAt
                ? `完成于 ${formatRelativeTime(todo.completedAt)}`
                : `创建于 ${formatRelativeTime(todo.createdAt)}`}
            </span>
          </button>
          <div className="todo-item__actions">
            <IconButton
              label={`编辑「${todo.title}」`}
              icon={<Pencil size={14} />}
              size="sm"
              onClick={beginEdit}
            />
            <IconButton
              label={`删除「${todo.title}」`}
              icon={<Trash2 size={14} />}
              size="sm"
              variant="danger"
              onClick={onRemove}
            />
          </div>
        </>
      )}
    </div>
  )
}
