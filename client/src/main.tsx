import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Polyfill for CommonJS exports in browser (needed for @squoosh/lib)
if (typeof window !== 'undefined') {
  if (typeof (window as any).exports === 'undefined') {
    (window as any).exports = {};
  }
  if (typeof (window as any).module === 'undefined') {
    (window as any).module = { exports: {} };
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event, message) => {
  console.log(message)
})
