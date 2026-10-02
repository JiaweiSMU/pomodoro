import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/jersey-20/latin-400.css'
import '@fontsource-variable/rubik/wght.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
