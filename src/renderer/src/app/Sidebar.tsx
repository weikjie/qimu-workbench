import { FileText, LayoutDashboard, Link2, ListChecks } from 'lucide-react'
import type { SectionId } from '@shared/types'
import { useTheme } from '../theme/ThemeProvider'
import { useWorkspace } from './WorkspaceProvider'
import { cn } from '../lib/cn'
import { BrandMark } from '../components/layout/BrandMark'

const NAV_ITEMS = [
  { id: 'overview', label: '今日总览', icon: LayoutDashboard },
  { id: 'todos', label: '待办清单', icon: ListChecks },
  { id: 'links', label: '快捷链接', icon: Link2 },
  { id: 'notes', label: 'Markdown 笔记', icon: FileText }
] as const satisfies ReadonlyArray<{ id: SectionId; label: string; icon: typeof LayoutDashboard }>

interface SidebarProps {
  active: SectionId
  onNavigate: (section: SectionId) => void
}

export function Sidebar({ active, onNavigate }: SidebarProps): React.JSX.Element {
  const { data } = useWorkspace()
  const { theme } = useTheme()
  const pendingTodos = data.todos.filter((todo) => !todo.done).length

  const count = (id: SectionId): number | null => {
    if (id === 'todos') return pendingTodos
    if (id === 'links') return data.links.length
    if (id === 'notes') return data.notes.length
    return null
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__brand drag-region">
        <BrandMark />
        <div className="sidebar__brand-copy">
          <span className="sidebar__brand-name">栖木</span>
          <span className="sidebar__brand-sub">WORKBENCH</span>
        </div>
      </div>

      <nav className="sidebar__nav" aria-label="主导航">
        <span className="sidebar__nav-label">空间</span>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const badge = count(item.id)
          return (
            <button
              key={item.id}
              type="button"
              data-section={item.id}
              className={cn('nav-item', active === item.id && 'is-active')}
              aria-current={active === item.id ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <span className="nav-item__icon">
                <Icon size={17} strokeWidth={1.8} />
              </span>
              <span className="nav-item__label">{item.label}</span>
              {badge !== null && badge > 0 ? <span className="nav-item__badge">{badge}</span> : null}
            </button>
          )
        })}
      </nav>

      <div className="sidebar__spacer" />

      <div className="sidebar__footer">
        <div className="local-card">
          <span className="local-card__pulse" aria-hidden="true" />
          <div>
            <strong>本地优先</strong>
            <span>所有内容只保存在这台设备</span>
          </div>
        </div>
        <div className="sidebar__meta">
          <span className="sidebar__theme">
            <span className="sidebar__theme-swatch" aria-hidden="true" />
            {theme.label}
          </span>
          <span>v0.1.1</span>
        </div>
      </div>
    </aside>
  )
}
