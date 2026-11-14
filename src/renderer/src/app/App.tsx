import { useEffect, useState } from 'react'
import type { SectionId } from '@shared/types'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useOpenFiles } from './OpenFilesProvider'
import { useWorkspace } from './WorkspaceProvider'
import { OverviewView } from '../features/overview/OverviewView'
import { TodosView } from '../features/todos/TodosView'
import { LinksView } from '../features/links/LinksView'
import { NotesView } from '../features/notes/NotesView'
import { BrandMark } from '../components/layout/BrandMark'
import { useToast } from '../components/ui/Toast'
import { screenshotBridge } from '../services/desktop'

function AppLoading(): React.JSX.Element {
  return (
    <div className="app-loading">
      <div className="app-loading__mark">
        <BrandMark size="lg" />
      </div>
      <p>正在打开你的工作台</p>
      <span className="app-loading__line" aria-hidden="true" />
    </div>
  )
}

export function App(): React.JSX.Element {
  const [active, setActive] = useState<SectionId>('overview')
  const { ready, saveState, loadError } = useWorkspace()
  const { activeFile, focusTick } = useOpenFiles()
  const { notify } = useToast()

  useEffect(() => {
    document.title = '栖木工作台'
  }, [])

  useEffect(() => {
    if (focusTick > 0) setActive('notes')
  }, [focusTick])

  // The global F1 shortcut is registered in the main process. This local
  // handler also covers setups where global shortcuts are unavailable (for
  // example a desktop environment that does not support them) while the
  // workbench window itself has focus.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key !== 'F1' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return
      }
      event.preventDefault()
      void screenshotBridge
        .start()
        .then((result) => {
          if (!result.ok) notify(result.message ?? '截图失败，请稍后重试。', 'error')
        })
        .catch((error: unknown) => {
          console.error('[workbench] could not start screenshot:', error)
          notify('无法启动截图。', 'error')
        })
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [notify])

  if (!ready) return <AppLoading />

  return (
    <div className="app-shell">
      <Sidebar active={active} onNavigate={setActive} />
      <div className="app-main">
        <TopBar
          section={active}
          saveState={active === 'notes' && activeFile ? activeFile.saveState : saveState}
        />
        <main
          className={
            active === 'notes' ? 'app-content app-content--fill app-content--editor' : 'app-content'
          }
        >
          {loadError ? (
            <div className="app-error" role="alert">
              <strong>本地数据暂时无法读取</strong>
              <span>{loadError}。你仍可以继续操作，本次更改可能无法保存。</span>
            </div>
          ) : null}
          <div
            key={active}
            className={
              active === 'notes' ? 'view-page view-page--fill view-page--editor' : 'view-page'
            }
          >
            {active === 'overview' ? <OverviewView onNavigate={setActive} /> : null}
            {active === 'todos' ? <TodosView /> : null}
            {active === 'links' ? <LinksView /> : null}
            {active === 'notes' ? <NotesView /> : null}
          </div>
        </main>
      </div>
    </div>
  )
}
