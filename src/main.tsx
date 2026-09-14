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

// Carga automatica del archivo de demostracion con `?fixture=demo`, para el
// recorrido de `/verificar`. La guarda no es cosmetica: en `build`,
// `import.meta.env.DEV` es `false`, Rollup elimina esta rama y el chunk
// dinamico nunca se emite, asi que el modulo NO EXISTE en produccion. Ver
// `src/dev/fixtureDesarrollo.ts`.
if (import.meta.env.DEV) {
  import('./dev/fixtureDesarrollo.ts')
    .then((m) => m.activarFixtureDesarrollo())
    .catch((error: unknown) => {
      console.error('[dev] no se pudo cargar el modulo de fixture', error)
    })
}
