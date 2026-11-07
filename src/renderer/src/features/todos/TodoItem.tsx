import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Copy, GripVertical, Pencil, Trash2, X } from 'lucide-react'
import { TODO_PRIORITIES, type TodoPriority } from '@shared/priorities'
import type { Todo } from '@shared/types'
import { cn } from '../../lib/cn'
import { formatRelativeTime } from '../../lib/format'
import { TODO_PRIORITY_META } from '../../lib/todo-priority'
import { IconButton } from '../../components/ui/IconButton'
import { RoundCheckbox } from '../../components/ui/RoundCheckbox'

interface TodoItemProps {
  todo: Todo
  dragging: boolean
  dropPosition: 'before' | 'after' | null
  onToggle: () => void
  onRename: (title: string) => void
  onPriorityChange: (priority: TodoPriority) => void
  onCopy: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
}

export function TodoItem({
  todo,
  dragging,
  dropPosition,
  onToggle,
  onRename,
  onPriorityChange,
  onCopy,
  onMoveUp,
  onMoveDown,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: TodoItemProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(todo.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragBlockedRef = useRef(false)

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
    <div
      className={cn(
        'todo-item',
        todo.done && 'is-done',
        editing && 'is-editing',
        dragging && 'is-dragging',
        dropPosition === 'before' && 'is-drop-before',
        dropPosition === 'after' && 'is-drop-after'
      )}
      draggable={!editing}
      onPointerDown={(event) => {
        // Buttons and fields keep their normal behavior; only the row's drag
        // handle (and empty space) starts a drag.
        dragBlockedRef.current = Boolean(
          (event.target as HTMLElement).closest('button, input, select, a')
        )
      }}
      onDragStart={(event) => {
        if (dragBlockedRef.current) {
          event.preventDefault()
          return
        }
        onDragStart(event)
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {editing ? (
        <span className="todo-item__drag" aria-hidden="true" />
      ) : (
        <span
          className="todo-item__drag"
          role="button"
          tabIndex={0}
          aria-label={`调整「${todo.title}」的顺序，聚焦后可按上、下方向键移动`}
          title="拖动调整顺序；聚焦后按 ↑ / ↓ 移动"
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              onMoveUp()
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              onMoveDown()
            }
          }}
        >
          <GripVertical size={14} strokeWidth={2} />
        </span>
      )}

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

          <span className="todo-priority-select" data-priority={todo.priority}>
            <select
              className="todo-priority-select__input"
              value={todo.priority}
              aria-label={`设置「${todo.title}」的优先级`}
              title={`优先级 ${todo.priority} · ${TODO_PRIORITY_META[todo.priority].label}（点击调整）`}
              onChange={(event) => onPriorityChange(event.target.value as TodoPriority)}
            >
              {TODO_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
            <ChevronDown
              size={9}
              strokeWidth={2.4}
              className="todo-priority-select__chevron"
              aria-hidden="true"
            />
          </span>

          <div className="todo-item__actions">
            <IconButton
              label={`复制「${todo.title}」`}
              icon={<Copy size={14} />}
              size="sm"
              onClick={onCopy}
            />
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
