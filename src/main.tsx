import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const raiz = document.getElementById('root')
if (raiz === null) throw new Error('No se encontró el nodo raíz #root')

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
