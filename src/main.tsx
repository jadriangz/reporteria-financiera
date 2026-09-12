import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { engancharTemaDelSistema } from './store/useTema.ts'

const raiz = document.getElementById('root')
if (raiz === null) throw new Error('No se encontró el nodo raíz #root')

// Antes de montar: el tema ya está puesto por el script de index.html, y desde
// aquí se queda escuchando al sistema mientras la pestaña viva.
engancharTemaDelSistema()

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
