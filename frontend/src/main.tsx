import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

if ((window as any).__meets_diag) (window as any).__meets_diag.jsStarted = true

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

if ((window as any).__meets_diag) (window as any).__meets_diag.reactMounted = true
