import { AlertCircle, CalendarDays, Check, LoaderCircle } from 'lucide-react'
import type { SectionId, SaveState } from '@shared/types'
import { formatDayChip } from '../lib/format'

const SECTION_LABELS: Record<SectionId, string> = {
  overview: '今日总览',
  todos: '待办清单',
  links: '快捷链接',
  notes: 'Markdown 笔记'
}

interface TopBarProps {
  section: SectionId
  saveState: SaveState
}

function SaveIndicator({ state }: { state: SaveState }): React.JSX.Element {
  if (state === 'saving') {
    return (
      <span className="save-state save-state--saving" aria-live="polite">
        <LoaderCircle size={13} className="spin" />
        正在保存
      </span>
    )
  }

  if (state === 'error') {
    return (
      <span className="save-state save-state--error" aria-live="polite">
        <AlertCircle size={13} />
        保存失败
      </span>
    )
  }

  if (state === 'loading') {
    return <span className="save-state save-state--muted">读取中</span>
  }

  return (
    <span className="save-state save-state--saved" aria-live="polite">
      <Check size={13} />
      已保存在本地
    </span>
  )
}

export function TopBar({ section, saveState }: TopBarProps): React.JSX.Element {
  return (
    <header className="topbar drag-region">
      <div className="topbar__crumb">
        <span>栖木</span>
        <span className="topbar__slash">/</span>
        <span className="topbar__current">{SECTION_LABELS[section]}</span>
      </div>
      <div className="topbar__meta">
        <SaveIndicator state={saveState} />
        <span className="topbar__separator" aria-hidden="true" />
        <span className="topbar__date">
          <CalendarDays size={14} />
          {formatDayChip()}
        </span>
      </div>
    </header>
  )
}
