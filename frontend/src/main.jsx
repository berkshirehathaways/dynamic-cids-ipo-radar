import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import RadarProvider from './store.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RadarProvider>
      <App />
    </RadarProvider>
  </StrictMode>,
)
