# Generador de Reportería Financiera

Webapp que recibe un archivo Excel/CSV con ventas, cobranza y gastos de una PyME y genera
dashboards financieros y operativos en pantalla, exportables a PDF.

Todo el procesamiento ocurre **en el navegador**: ningún dato financiero viaja a un servidor.
Sin backend, sin base de datos, sin persistencia — es una restricción de arquitectura, no una
preferencia.

## Stack

| Área | Herramienta |
|---|---|
| Build | Vite + React + TypeScript (strict) |
| Estilos | Tailwind CSS v4 (plugin de Vite, sin PostCSS) |
| Validación | Zod |
| Lectura de archivos | SheetJS (`xlsx`), PapaParse |
| Gráficas | Recharts |
| Tablas | TanStack Table |
| Estado | Zustand |
| Pruebas | Vitest |
| Linter | oxlint |

## Comandos

```bash
npm run dev        # servidor de desarrollo
npm run build      # typecheck + build de producción
npm run preview    # sirve el build
npm run typecheck  # tsc sobre los project references
npm run lint       # oxlint (correctness, suspicious, perf)
npm run lint:fix   # oxlint con autofix
npm run test       # vitest, una pasada
```

## Estructura

```
src/
  lib/
    schema.ts          contrato de datos canónico — fuente de verdad,
                       coincide campo por campo con la plantilla Excel
    parse/             lectores de xlsx y csv, validador
    calc/              motor de cálculo: funciones puras, sin React
      __tests__/       pruebas contra el archivo de demostración ficticio
    format/            formateo de moneda, fecha, porcentaje
  store/               estado global (Zustand), en memoria
  modules/             un directorio por módulo de reporte
    resumen/             1. Resumen ejecutivo
    estado-resultados/   2. Estado de resultados
    ventas-flujo/        3. Ventas y flujo
    cobranza/            4. Cobranza
    producto/            5. Rendimiento por producto
    clientes/            6. Clientes
  components/ui/       primitivas compartidas
docs/                  plantilla Excel, PDF de referencia, contrato
```

Reglas de arquitectura, definiciones de cálculo y orden de construcción: ver `CLAUDE.md`.

## Convenciones

- Toda cifra monetaria se maneja **en centavos como entero** dentro del motor; se formatea
  solo al pintar.
- Ningún componente calcula. Si un componente hace `.reduce()` sobre montos, ese cálculo va
  en `src/lib/calc/` con su prueba.
- Nada de `localStorage`, `sessionStorage` ni `IndexedDB` en v1.
