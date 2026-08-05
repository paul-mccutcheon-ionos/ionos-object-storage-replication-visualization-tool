import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { RegionsProvider } from './regionsContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RegionsProvider>
      <App />
    </RegionsProvider>
  </StrictMode>,
)
