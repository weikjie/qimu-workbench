import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/themes/light.css'
import './styles/base.css'
import './styles/tones.css'
import './components/ui/ui.css'
import './app/app.css'
import { ThemeProvider } from './theme/ThemeProvider'
import { ToastProvider } from './components/ui/Toast'
import { WorkspaceProvider } from './app/WorkspaceProvider'
import { OpenFilesProvider } from './app/OpenFilesProvider'
import { App } from './app/App'

const container = document.getElementById('root')
if (!container) throw new Error('Root container was not found')

createRoot(container).render(
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
