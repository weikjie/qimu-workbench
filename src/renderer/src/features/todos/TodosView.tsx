import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Eraser, ListTodo, Plus, Sparkles } from 'lucide-react'
import { useWorkspace } from '../../app/WorkspaceProvider'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { TodoItem } from './TodoItem'
import './todos.css'

type Filter = 'all' | 'open' | 'done'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'open', label: '待完成' },
  { id: 'done', label: '已完成' }
]

export function TodosView(): React.JSX.Element {
  const { data, addTodo, toggleTodo, renameTodo, removeTodo, clearCompleted } = useWorkspace()
  const { notify } = useToast()
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [confirmClear, setConfirmClear] = useState(false)
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

  const completion = counts.all === 0 ? 0 : Math.round((counts.done / counts.all) * 100)

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!draft.trim()) return
    addTodo(draft)
    setDraft('')
    inputRef.current?.focus()
  }

  function handleClearCompleted(): void {
    const removed = counts.done
    clearCompleted()
    notify(`已清除 ${removed} 件已完成待办`, 'success')
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
        description="把要做的事放在看得见的地方，一次只专注一件。"
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

      <div className="todo-list">
        {visibleTodos.length > 0 ? (
          visibleTodos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={() => toggleTodo(todo.id)}
              onRename={(title) => renameTodo(todo.id, title)}
              onRemove={() => removeTodo(todo.id)}
            />
          ))
        ) : (
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
        )}
      </div>

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
