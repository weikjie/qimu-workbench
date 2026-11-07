import { useEffect, useState } from 'react'
import type { BrowserInfo } from '@shared/types'
import { desktop } from '../services/desktop'

interface BrowserListState {
  browsers: BrowserInfo[]
  loading: boolean
  error: boolean
}

export function useBrowsers(): BrowserListState {
  const [state, setState] = useState<BrowserListState>({
    browsers: [],
    loading: true,
    error: false
  })

  useEffect(() => {
    let active = true
    desktop
      .listBrowsers()
      .then((browsers) => {
        if (active) setState({ browsers, loading: false, error: false })
      })
      .catch((error: unknown) => {
        console.error('Unable to detect browsers:', error)
        if (active) setState({ browsers: [], loading: false, error: true })
      })
    return () => {
      active = false
    }
  }, [])

  return state
}
