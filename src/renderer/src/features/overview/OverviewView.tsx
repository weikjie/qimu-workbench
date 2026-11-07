import { useMemo } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  CircleCheckBig,
  FileText,
  Link2,
  ListTodo,
  PenLine,
  Plus,
  Sparkles
} from 'lucide-react'
import type { QuickLink, SectionId } from '@shared/types'
import { useWorkspace } from '../../app/WorkspaceProvider'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { RoundCheckbox } from '../../components/ui/RoundCheckbox'
import { useToast } from '../../components/ui/Toast'
import { formatLongDate, formatRelativeTime, getGreeting } from '../../lib/format'
import { getExcerpt } from '../../lib/markdown'
import { getHostname, getLinkInitial, getLinkTone } from '../../lib/url'
import { desktop } from '../../services/desktop'
import './overview.css'

interface OverviewViewProps {
  onNavigate: (section: SectionId) => void
}

export function OverviewView({ onNavigate }: OverviewViewProps): React.JSX.Element {
  const { data, toggleTodo } = useWorkspace()
  const { notify } = useToast()

  const pendingTodos = data.todos.filter((todo) => !todo.done)
  const completedTodos = data.todos.length - pendingTodos.length
  const totalTodos = data.todos.length
  const completion = totalTodos === 0 ? 0 : Math.round((completedTodos / totalTodos) * 100)

  const previewTodos = useMemo(() => {
    const pending = data.todos.filter((todo) => !todo.done).slice(0, 4)
    if (pending.length > 0) return pending
    return data.todos.filter((todo) => todo.done).slice(0, 3)
  }, [data.todos])

  const sortedNotes = useMemo(
    () => [...data.notes].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [data.notes]
  )
  const recentNotes = sortedNotes.slice(0, 3)
  const latestNote = sortedNotes[0]

  async function openLink(link: QuickLink): Promise<void> {
    const result = await desktop.openLink(link.url, link.browserId)
    if (!result.ok) notify(result.message ?? '暂时无法打开这个链接。', 'error')
  }

  const greeting = getGreeting()
  const pendingLine =
    pendingTodos.length > 0
      ? `还有 ${pendingTodos.length} 件小事在等你，不必着急，一件一件来。`
      : totalTodos > 0
        ? '今天的清单已经清空。给自己留一点空白，也很好。'
        : '清单还是空的。写下第一件小事，让今天有一个轻盈的开始。'

  return (
    <div className="overview-page">
      <section className="overview-hero">
        <span className="overview-hero__halo" aria-hidden="true" />
        <span className="overview-hero__grain" aria-hidden="true" />
        <div className="overview-hero__copy">
          <span className="overview-hero__kicker">
            <Sparkles size={13} strokeWidth={1.8} />
            {formatLongDate()}
          </span>
          <h1>
            {greeting}，<span>今天也从容一点。</span>
          </h1>
          <p>{pendingLine}</p>
        </div>
        <div className="overview-hero__actions">
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => onNavigate('todos')}>
            记下一件待办
          </Button>
          <Button variant="ghost" icon={<PenLine size={15} />} onClick={() => onNavigate('notes')}>
            写点什么
          </Button>
        </div>
      </section>

      <section className="stat-grid" aria-label="工作台概览">
        <button type="button" className="stat-card" data-tone="green" onClick={() => onNavigate('todos')}>
          <div className="stat-card__head">
            <span className="stat-card__icon">
              <ListTodo size={17} strokeWidth={1.85} />
            </span>
            <span className="stat-card__label">待完成</span>
            <ArrowUpRight size={14} className="stat-card__arrow" />
          </div>
          <div className="stat-card__value">
            {pendingTodos.length}
            <small>件</small>
          </div>
          <p className="stat-card__detail">{completedTodos > 0 ? `今天已完成 ${completedTodos} 件` : '从最重要的一件开始'}</p>
        </button>

        <button type="button" className="stat-card" data-tone="amber" onClick={() => onNavigate('todos')}>
          <div className="stat-card__head">
            <span className="stat-card__icon">
              <CircleCheckBig size={17} strokeWidth={1.85} />
            </span>
            <span className="stat-card__label">完成度</span>
            <ArrowUpRight size={14} className="stat-card__arrow" />
          </div>
          <div className="stat-card__value">
            {completion}
            <small>%</small>
          </div>
          <p className="stat-card__detail">
            {totalTodos === 0 ? '还没有待办事项' : `${completedTodos} / ${totalTodos} 件已完成`}
          </p>
        </button>

        <button type="button" className="stat-card" data-tone="blue" onClick={() => onNavigate('notes')}>
          <div className="stat-card__head">
            <span className="stat-card__icon">
              <FileText size={17} strokeWidth={1.85} />
            </span>
            <span className="stat-card__label">笔记</span>
            <ArrowUpRight size={14} className="stat-card__arrow" />
          </div>
          <div className="stat-card__value">
            {data.notes.length}
            <small>篇</small>
          </div>
          <p className="stat-card__detail">
            {latestNote ? `最近编辑「${latestNote.title || '无标题笔记'}」` : '记录第一个想法'}
          </p>
        </button>

        <button type="button" className="stat-card" data-tone="plum" onClick={() => onNavigate('links')}>
          <div className="stat-card__head">
            <span className="stat-card__icon">
              <Link2 size={17} strokeWidth={1.85} />
            </span>
            <span className="stat-card__label">快捷链接</span>
            <ArrowUpRight size={14} className="stat-card__arrow" />
          </div>
          <div className="stat-card__value">
            {data.links.length}
            <small>个</small>
          </div>
          <p className="stat-card__detail">常看的网站，一键抵达</p>
        </button>
      </section>

      <div className="dashboard-grid">
        <section className="surface-card todo-preview-card">
          <header className="card-head">
            <div className="card-title">
              今日待办
              {pendingTodos.length > 0 ? <span className="card-count">{pendingTodos.length}</span> : null}
            </div>
            <button type="button" className="text-button" onClick={() => onNavigate('todos')}>
              查看全部
              <ArrowRight size={13} />
            </button>
          </header>

          {previewTodos.length > 0 ? (
            <div className="preview-todos">
              {previewTodos.map((todo) => (
                <div key={todo.id} className={`preview-todo${todo.done ? ' is-done' : ''}`}>
                  <RoundCheckbox
                    checked={todo.done}
                    onChange={() => toggleTodo(todo.id)}
                    label={todo.done ? `将「${todo.title}」标记为未完成` : `完成「${todo.title}」`}
                    size="sm"
                  />
                  <button type="button" className="preview-todo__body" onClick={() => toggleTodo(todo.id)}>
                    <span className="preview-todo__title">{todo.title}</span>
                    <span className="preview-todo__meta">
                      {todo.done ? '已完成' : formatRelativeTime(todo.createdAt)}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              icon={<ListTodo size={21} strokeWidth={1.7} />}
              title="清单轻轻的空着"
              description="把脑海里挂着的那件小事写下来，就能安心许多。"
              action={
                <Button size="sm" variant="soft" icon={<Plus size={14} />} onClick={() => onNavigate('todos')}>
                  添加待办
                </Button>
              }
            />
          )}

          {totalTodos > 0 ? (
            <div className="todo-progress">
              <div className="todo-progress__copy">
                <span>今日进度</span>
                <strong>{completion}%</strong>
              </div>
              <div
                className="todo-progress__track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={completion}
                aria-label="待办完成度"
              >
                <span style={{ width: `${completion}%` }} />
              </div>
            </div>
          ) : null}
        </section>

        <section className="surface-card links-preview-card">
          <header className="card-head">
            <div className="card-title">
              快捷入口
              {data.links.length > 0 ? <span className="card-count">{data.links.length}</span> : null}
            </div>
            <button type="button" className="text-button" onClick={() => onNavigate('links')}>
              管理
              <ArrowRight size={13} />
            </button>
          </header>

          {data.links.length > 0 ? (
            <div className="mini-links">
              {data.links.slice(0, 4).map((link) => (
                <button
                  key={link.id}
                  type="button"
                  className="mini-link"
                  data-tone={getLinkTone(link.url)}
                  aria-label={`打开 ${link.title}`}
                  onClick={() => void openLink(link)}
                >
                  <span className="mini-link__icon">{getLinkInitial(link.title, link.url)}</span>
                  <span className="mini-link__copy">
                    <strong>{link.title}</strong>
                    <span>{getHostname(link.url)}</span>
                  </span>
                  <ArrowUpRight size={13} className="mini-link__arrow" />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              icon={<Link2 size={21} strokeWidth={1.7} />}
              title="还没有快捷链接"
              description="把每天都会打开的网页放进来。"
              action={
                <Button size="sm" variant="soft" icon={<Plus size={14} />} onClick={() => onNavigate('links')}>
                  添加链接
                </Button>
              }
            />
          )}
        </section>
      </div>

      <section className="recent-notes">
        <header className="recent-notes__head">
          <div className="card-title">最近笔记</div>
          <button type="button" className="text-button" onClick={() => onNavigate('notes')}>
            打开笔记
            <ArrowRight size={13} />
          </button>
        </header>

        {recentNotes.length > 0 ? (
          <div className="note-card-grid">
            {recentNotes.map((note) => (
              <button
                key={note.id}
                type="button"
                className="note-preview-card"
                onClick={() => onNavigate('notes')}
              >
                <div className="note-preview-card__top">
                  <span className="note-preview-card__icon">
                    <FileText size={16} strokeWidth={1.7} />
                  </span>
                  <span>{formatRelativeTime(note.updatedAt)}</span>
                  <ArrowUpRight size={14} className="note-preview-card__arrow" />
                </div>
                <h3>{note.title || '无标题笔记'}</h3>
                <p>{getExcerpt(note.content, 96) || '一篇还没有内容的空白笔记。'}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="surface-card">
            <EmptyState
              compact
              icon={<PenLine size={21} strokeWidth={1.7} />}
              title="还没有写下任何文字"
              description="Markdown 笔记支持标题、列表、代码块与表格。"
              action={
                <Button size="sm" variant="soft" icon={<Plus size={14} />} onClick={() => onNavigate('notes')}>
                  新建笔记
                </Button>
              }
            />
          </div>
        )}
      </section>
    </div>
  )
}
