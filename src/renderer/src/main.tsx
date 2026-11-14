import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/themes/light.css'
import './styles/base.css'
import './styles/tones.css'
import './components/ui/ui.css'
import './app/app.css'
import './features/screenshot/screenshot.css'
import { ThemeProvider } from './theme/ThemeProvider'
import { ToastProvider } from './components/ui/Toast'
import { WorkspaceProvider } from './app/WorkspaceProvider'
import { OpenFilesProvider } from './app/OpenFilesProvider'
import { App } from './app/App'
import { ScreenshotOverlay } from './features/screenshot/ScreenshotOverlay'
import { PinWindow } from './features/screenshot/PinWindow'

const container = document.getElementById('root')
if (!container) throw new Error('Root container was not found')

const params = new URLSearchParams(window.location.search)
const mode = params.get('mode')
const root = createRoot(container)

if (mode === 'shot') {
  document.documentElement.classList.add('window-shot')
  root.render(
    <ScreenshotOverlay
      sessionId={params.get('session') ?? ''}
      displayId={Number(params.get('display'))}
    />
  )
} else if (mode === 'pin') {
  document.documentElement.classList.add('window-pin')
  root.render(<PinWindow pinId={params.get('pin') ?? ''} />)
} else {
  root.render(
    <StrictMode>
      <ThemeProvider>
        <WorkspaceProvider>
          <ToastProvider>
            <OpenFilesProvider>
              <App />
            </OpenFilesProvider>
          </ToastProvider>
        </WorkspaceProvider>
      </ThemeProvider>
    </StrictMode>
  )
}
