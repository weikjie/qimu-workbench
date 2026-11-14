import { useEffect, useState } from 'react'
import { AlertCircle, CalendarDays, Camera, Check, LoaderCircle } from 'lucide-react'
import type { SectionId, SaveState } from '@shared/types'
import { formatDayChip } from '../lib/format'
import { IconButton } from '../components/ui/IconButton'
import { useToast } from '../components/ui/Toast'
import { screenshotBridge } from '../services/desktop'

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
  const { notify } = useToast()
  const [capturing, setCapturing] = useState(false)
  const [shortcut, setShortcut] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    screenshotBridge
      .getShortcut()
      .then((label) => {
        if (active) setShortcut(label)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const capture = async (): Promise<void> => {
    if (capturing) return
    setCapturing(true)
    try {
      const result = await screenshotBridge.start()
      if (!result.ok) notify(result.message ?? '截图失败，请稍后重试。', 'error')
    } catch (error) {
      console.error('[workbench] could not start screenshot:', error)
      notify('无法启动截图。', 'error')
    } finally {
      setCapturing(false)
    }
  }

  return (
    <header className="topbar drag-region">
      <div className="topbar__crumb">
        <span>栖木</span>
        <span className="topbar__slash">/</span>
        <span className="topbar__current">{SECTION_LABELS[section]}</span>
      </div>
      <div className="topbar__meta">
        <IconButton
          label={shortcut ? `截图（${shortcut}）` : '截图'}
          className="topbar__capture"
          icon={
            capturing ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Camera size={15} strokeWidth={1.8} />
            )
          }
          onClick={() => void capture()}
        />
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
