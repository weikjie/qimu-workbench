import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Copy, GripVertical, Pencil, Trash2, X } from 'lucide-react'
import { TODO_PRIORITIES, type TodoPriority } from '@shared/priorities'
import type { Todo } from '@shared/types'
import { cn } from '../../lib/cn'
import { formatRelativeTime } from '../../lib/format'
import { TODO_PRIORITY_META } from '../../lib/todo-priority'
import { useAutosizeTextarea } from '../../hooks/useAutosizeTextarea'
import { IconButton } from '../../components/ui/IconButton'
import { RoundCheckbox } from '../../components/ui/RoundCheckbox'

interface TodoItemProps {
  todo: Todo
  onToggle: () => void
  onRename: (title: string) => void
  onPriorityChange: (priority: TodoPriority) => void
  onCopy: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  onPressStart: (event: React.PointerEvent<HTMLElement>) => void
  /** Ignore the click that follows a drag. */
  shouldIgnoreClick?: () => boolean
}

export function TodoItem({
  todo,
  onToggle,
  onRename,
  onPriorityChange,
  onCopy,
  onMoveUp,
  onMoveDown,
  onRemove,
  onPressStart,
  shouldIgnoreClick
}: TodoItemProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(todo.title)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useAutosizeTextarea(inputRef, draft, { maxRows: 50, enabled: editing })

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
      className={cn('todo-item', todo.done && 'is-done', editing && 'is-editing')}
      data-todo-row={todo.id}
      data-flip-id={todo.id}
      onPointerDown={editing ? undefined : (event) => onPressStart(event)}
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
          <textarea
            ref={inputRef}
            value={draft}
            maxLength={500}
            rows={1}
            aria-label="编辑待办内容"
            className="todo-edit__input"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Enter' && !event.shiftKey) {
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
          <span className="todo-priority-select" data-priority={todo.priority} data-no-drag>
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

          <button type="button" className="todo-item__body" onClick={onToggle}>
            <span className="todo-item__title">{todo.title}</span>
            <span className="todo-item__meta">
              {todo.done && todo.completedAt
                ? `完成于 ${formatRelativeTime(todo.completedAt)}`
                : `创建于 ${formatRelativeTime(todo.createdAt)}`}
            </span>
          </button>

          <div className="todo-item__actions" data-no-drag>
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
              onClick={() => {
                if (shouldIgnoreClick?.()) return
                beginEdit()
              }}
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
