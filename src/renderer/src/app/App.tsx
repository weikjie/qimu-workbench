import { useEffect, useState } from 'react'
import type { SectionId } from '@shared/types'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useWorkspace } from './WorkspaceProvider'
import { OverviewView } from '../features/overview/OverviewView'
import { TodosView } from '../features/todos/TodosView'
import { LinksView } from '../features/links/LinksView'
import { NotesView } from '../features/notes/NotesView'
import { BrandMark } from '../components/layout/BrandMark'

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

  useEffect(() => {
    document.title = '栖木工作台'
  }, [])

  if (!ready) return <AppLoading />

  return (
    <div className="app-shell">
      <Sidebar active={active} onNavigate={setActive} />
      <div className="app-main">
        <TopBar section={active} saveState={saveState} />
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
