import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Eraser, ListTodo, Plus, Sparkles } from 'lucide-react'
import {
  DEFAULT_TODO_PRIORITY,
  TODO_PRIORITIES,
  type TodoPriority
} from '@shared/priorities'
import type { Todo } from '@shared/types'
import { useWorkspace } from '../../app/WorkspaceProvider'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { PriorityBadge } from '../../components/ui/PriorityBadge'
import { useToast } from '../../components/ui/Toast'
import { TODO_PRIORITY_META } from '../../lib/todo-priority'
import { desktop } from '../../services/desktop'
import { TodoItem } from './TodoItem'
import './todos.css'

type Filter = 'all' | 'open' | 'done'
type DropPosition = 'before' | 'after'

interface DropTarget {
  id: string
  position: DropPosition
}

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'open', label: '待完成' },
  { id: 'done', label: '已完成' }
]

export function TodosView(): React.JSX.Element {
  const {
    data,
    addTodo,
    toggleTodo,
    renameTodo,
    setTodoPriority,
    reorderTodo,
    removeTodo,
    clearCompleted
  } = useWorkspace()
  const { notify } = useToast()
  const [draft, setDraft] = useState('')
  const [draftPriority, setDraftPriority] = useState<TodoPriority>(DEFAULT_TODO_PRIORITY)
  const [filter, setFilter] = useState<Filter>('all')
  const [confirmClear, setConfirmClear] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const counts = useMemo(
    () => ({
      all: data.todos.length,
      open: data.todos.filter((todo) => !todo.done).length,
      done: data.todos.filter((todo) => todo.done).length
    }),
    [data.todos]
  )

  const visibleTodos = useMemo(() => {
    if (filter === 'open') return data.todos.filter((todo) => !todo.done)
    if (filter === 'done') return data.todos.filter((todo) => todo.done)
    return data.todos
  }, [data.todos, filter])

  const groups = useMemo(
    () =>
      TODO_PRIORITIES.map((priority) => ({
        priority,
        todos: visibleTodos.filter((todo) => todo.priority === priority)
      })).filter((group) => group.todos.length > 0),
    [visibleTodos]
  )

  const draggedTodo = dragId
    ? (data.todos.find((todo) => todo.id === dragId) ?? null)
    : null

  const completion = counts.all === 0 ? 0 : Math.round((counts.done / counts.all) * 100)

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!draft.trim()) return
    addTodo(draft, draftPriority)
    setDraft('')
    setDraftPriority(DEFAULT_TODO_PRIORITY)
    inputRef.current?.focus()
  }

  function handleClearCompleted(): void {
    const removed = counts.done
    clearCompleted()
    notify(`已清除 ${removed} 件已完成待办`, 'success')
  }

  async function copyTodo(todo: Todo): Promise<void> {
    try {
      const result = await desktop.copyText(todo.title)
      if (!result.ok) {
        notify(result.message ?? '复制到剪贴板失败。', 'error')
        return
      }
      notify('已复制到剪贴板', 'success')
    } catch (error) {
      console.error('Unable to copy todo:', error)
      notify('复制到剪贴板失败，请稍后重试。', 'error')
    }
  }

  function moveWithinPriority(todoId: string, direction: 'up' | 'down'): void {
    const todo = visibleTodos.find((item) => item.id === todoId)
    if (!todo) return
    const group = visibleTodos.filter((item) => item.priority === todo.priority)
    const index = group.findIndex((item) => item.id === todoId)
    const neighbor = group[index + (direction === 'up' ? -1 : 1)]
    if (!neighbor) return
    reorderTodo(todo.id, neighbor.id, direction === 'up' ? 'before' : 'after')
  }

  function handleDragStart(event: React.DragEvent<HTMLDivElement>, todo: Todo): void {
    setDragId(todo.id)
    setDropTarget(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-qimu-todo', todo.id)
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>, todo: Todo): void {
    if (!draggedTodo || draggedTodo.id === todo.id || draggedTodo.priority !== todo.priority) {
      event.dataTransfer.dropEffect = 'none'
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    const position: DropPosition = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDropTarget((current) =>
      current?.id === todo.id && current.position === position
        ? current
        : { id: todo.id, position }
    )
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>, todo: Todo): void {
    event.preventDefault()
    const moving = draggedTodo
    const rect = event.currentTarget.getBoundingClientRect()
    const position: DropPosition = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDragId(null)
    setDropTarget(null)
    if (!moving || moving.id === todo.id || moving.priority !== todo.priority) return
    reorderTodo(moving.id, todo.id, position)
  }

  function clearDrag(): void {
    setDragId(null)
    setDropTarget(null)
  }

  const filterEmpty =
    filter === 'done'
      ? { title: '还没有完成的事', description: '完成一件待办，它会安静地来到这里。' }
      : filter === 'open'
        ? { title: '待办都完成了', description: '给自己泡杯茶，享受一会儿空白。' }
        : { title: '清单还是空的', description: '把第一件想做的事写下来，今天就有了起点。' }

  return (
    <div className="todos-page">
      <PageHeader
        eyebrow="TODOS"
        title="待办清单"
        description="按优先级安排，一次只专注一件。"
        actions={
          <div className="todos-summary">
            <div className="todos-summary__copy">
              <span>完成进度</span>
              <strong>{completion}%</strong>
            </div>
            <div className="todos-summary__track" aria-hidden="true">
              <span style={{ width: `${completion}%` }} />
            </div>
          </div>
        }
      />

      <form className="todo-composer" onSubmit={handleSubmit}>
        <span className="todo-composer__icon" aria-hidden="true">
          <Plus size={18} />
        </span>
        <input
          ref={inputRef}
          value={draft}
          maxLength={500}
          className="todo-composer__input"
          placeholder="接下来要做什么？"
          aria-label="新的待办事项"
          onChange={(event) => setDraft(event.target.value)}
        />

        <div className="todo-priority-picker" role="group" aria-label="新待办优先级">
          <span className="todo-priority-picker__label" aria-hidden="true">
            优先级
          </span>
          {TODO_PRIORITIES.map((priority) => {
            const meta = TODO_PRIORITY_META[priority]
            return (
              <button
                key={priority}
                type="button"
                className="priority-pick"
                data-priority={priority}
                aria-pressed={draftPriority === priority}
                aria-label={`${priority} ${meta.label}`}
                title={`${priority} · ${meta.label}（${meta.hint}）`}
                onClick={() => setDraftPriority(priority)}
              >
                {priority}
              </button>
            )
          })}
        </div>

        <span className="todo-composer__hint" aria-hidden="true">
          Enter
        </span>
        <Button type="submit" variant="primary" size="sm" disabled={!draft.trim()}>
          添加
        </Button>
      </form>

      <div className="todo-toolbar">
        <div className="todo-filters" role="group" aria-label="筛选待办">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`todo-filter${filter === item.id ? ' is-active' : ''}`}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span className="todo-filter__count">{counts[item.id]}</span>
            </button>
          ))}
        </div>

        <div className="todo-toolbar__right">
          {counts.done > 0 ? (
            <button type="button" className="todo-clear" onClick={() => setConfirmClear(true)}>
              <Eraser size={13} />
              清除已完成
            </button>
          ) : (
            <span className="todo-toolbar__note">
              <Sparkles size={12} />
              {counts.open === 0 && counts.all > 0 ? '今天的清单已经完成' : '从最重要的一件开始'}
            </span>
          )}
        </div>
      </div>

      {visibleTodos.length > 0 ? (
        <div className="todo-groups">
          {groups.map(({ priority, todos }) => {
            const meta = TODO_PRIORITY_META[priority]
            return (
              <section
                key={priority}
                className="todo-group"
                data-priority={priority}
                aria-label={`${priority} ${meta.label}待办`}
              >
                <header className="todo-group__head">
                  <PriorityBadge priority={priority} />
                  <span className="todo-group__name">{meta.label}</span>
                  <span className="todo-group__count">{todos.length}</span>
                  {todos.length > 1 ? (
                    <span className="todo-group__hint">组内拖动排序</span>
                  ) : null}
                </header>

                <div className="todo-list">
                  {todos.map((todo) => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      dragging={dragId === todo.id}
                      dropPosition={dropTarget?.id === todo.id ? dropTarget.position : null}
                      onToggle={() => toggleTodo(todo.id)}
                      onRename={(title) => renameTodo(todo.id, title)}
                      onPriorityChange={(nextPriority) => setTodoPriority(todo.id, nextPriority)}
                      onCopy={() => void copyTodo(todo)}
                      onMoveUp={() => moveWithinPriority(todo.id, 'up')}
                      onMoveDown={() => moveWithinPriority(todo.id, 'down')}
                      onRemove={() => removeTodo(todo.id)}
                      onDragStart={(event) => handleDragStart(event, todo)}
                      onDragOver={(event) => handleDragOver(event, todo)}
                      onDrop={(event) => handleDrop(event, todo)}
                      onDragEnd={clearDrag}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="todo-list">
          <EmptyState
            icon={<ListTodo size={23} strokeWidth={1.7} />}
            title={filterEmpty.title}
            description={filterEmpty.description}
            action={
              filter !== 'all' ? (
                <Button size="sm" variant="soft" onClick={() => setFilter('all')}>
                  查看全部待办
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="soft"
                  icon={<Plus size={14} />}
                  onClick={() => inputRef.current?.focus()}
                >
                  写下第一件
                </Button>
              )
            }
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="清除已完成的待办？"
        description={`将移除 ${counts.done} 件已完成的待办，这个操作无法撤销。`}
        confirmLabel="清除"
        onConfirm={handleClearCompleted}
        onClose={() => setConfirmClear(false)}
      />
    </div>
  )
}
