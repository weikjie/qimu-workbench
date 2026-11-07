import type { TodoPriority } from '@shared/priorities'
import { cn } from '../../lib/cn'
import { TODO_PRIORITY_META } from '../../lib/todo-priority'

interface PriorityBadgeProps {
  priority: TodoPriority
  className?: string
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps): React.JSX.Element {
  const meta = TODO_PRIORITY_META[priority]
  return (
    <span
      className={cn('priority-badge', className)}
      data-priority={priority}
      aria-label={`优先级 ${priority}：${meta.label}`}
      title={`${priority} · ${meta.label}（${meta.hint}）`}
    >
      {priority}
    </span>
  )
}
