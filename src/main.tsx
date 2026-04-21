import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
// Note: ?demo=true URL param is handled by an inline script in index.html
// that runs BEFORE this module (and before the Zustand store reads
// localStorage). See index.html for that logic.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
