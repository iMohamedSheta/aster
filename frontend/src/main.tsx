import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import '@fontsource-variable/manrope'
import '@fontsource-variable/alexandria'
import App from './App'
import { ToastProvider } from './components/Toast'
import { LocaleProvider } from './lib/LocaleContext'
import { applyAppearance, readAppearance } from './lib/appearance'
import './index.css'

// Paint the saved accent before React mounts so the window never flashes copper.
applyAppearance(readAppearance())

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocaleProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </ToastProvider>
      </QueryClientProvider>
    </LocaleProvider>
  </React.StrictMode>,
)
