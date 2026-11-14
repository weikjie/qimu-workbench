import { createPortal } from 'react-dom'
import { Check, ChevronDown, GripVertical } from 'lucide-react'
import { cn } from '../../lib/cn'
import { formatRelativeTime } from '../../lib/format'
import type { TodoDragPreview as TodoDragPreviewData } from './useTodoDrag'

interface TodoDragPreviewProps {
  preview: TodoDragPreviewData
  previewRef: React.RefObject<HTMLDivElement | null>
}

/** A non-interactive clone of the row that follows the pointer. */
export function TodoDragPreview({
  preview,
  previewRef
}: TodoDragPreviewProps): React.ReactPortal {
  const { todo, width, height } = preview

  return createPortal(
    <div
      ref={previewRef}
      className="todo-item todo-item--drag-preview"
      style={{ width, height }}
      aria-hidden="true"
    >
      <span className="todo-item__drag">
        <GripVertical size={14} strokeWidth={2} />
      </span>

      <span className={cn('round-check', todo.done && 'is-checked')}>
        {todo.done ? <Check size={12} strokeWidth={3} /> : null}
      </span>

      <span className="todo-priority-select" data-priority={todo.priority}>
        <span className="todo-priority-select__input todo-priority-select__input--static">
          {todo.priority}
        </span>
        <ChevronDown
          size={9}
          strokeWidth={2.4}
          className="todo-priority-select__chevron"
          aria-hidden="true"
        />
      </span>

      <div className="todo-item__body">
        <span className="todo-item__title">{todo.title}</span>
        <span className="todo-item__meta">
          {todo.done && todo.completedAt
            ? `完成于 ${formatRelativeTime(todo.completedAt)}`
            : `创建于 ${formatRelativeTime(todo.createdAt)}`}
        </span>
      </div>
    </div>,
    document.body
  )
}
