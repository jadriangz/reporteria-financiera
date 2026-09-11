import { readFileSync } from "node:fs";

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * La version del reporte sale de package.json y de ningun otro lado.
 *
 * Un reporte sin version no es auditable (GOBERNANZA.md, seccion 3): si el
 * socio ve una cifra distinta el mes que viene, la version es lo que permite
 * saber con que codigo se genero cada uno. Se inyecta en tiempo de build para
 * no arrastrar package.json entero al bundle.
 */
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react(), tailwindcss()],
  test: {
    // El motor de calculo son funciones puras: no necesita DOM.
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
