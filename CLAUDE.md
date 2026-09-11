# CLAUDE.md — Generador de Reportería Financiera

## Contexto

Webapp que recibe un archivo Excel/CSV con datos de ventas, cobranza y gastos de una PyME y
genera dashboards financieros y operativos en pantalla, exportables a PDF.

Cliente inicial: comercializadora de drones agrícolas en México. El diseño debe ser
**agnóstico al giro** — cualquier negocio que venda productos con costo, cobre a crédito y
tenga gastos debe poder usar la misma plantilla.

Todo el procesamiento ocurre **en el navegador**. Ningún dato financiero viaja a un servidor.
Es un argumento de venta explícito y una restricción de arquitectura, no una preferencia.

## Stack (no sustituir sin discutirlo)

- Vite + React 19 + TypeScript (strict)
- Tailwind CSS
- Zod — validación del archivo cargado
- SheetJS (`xlsx`) — lectura de .xlsx
- PapaParse — lectura de .csv
- Recharts — gráficas
- TanStack Table — tablas con orden y drill-down
- Zustand — estado global
- Vitest — pruebas del motor de cálculo
- Sin backend, sin base de datos, sin autenticación en v1.

## Reglas duras

1. **Nunca usar `localStorage`, `sessionStorage` ni `IndexedDB`** en v1. Estado en memoria.
2. **El motor de cálculo vive en `src/lib/calc/` y son funciones puras.** Reciben `Dataset`,
   devuelven objetos de resultado. Sin React, sin fetch, sin efectos secundarios. Es lo que
   permite migrar la fuente de datos a la API de Odoo sin tocar la UI.
3. **Ningún componente calcula.** Un componente que hace `.reduce()` sobre montos está mal:
   ese cálculo va en `src/lib/calc/` con su prueba.
4. **Toda cifra monetaria en centavos como entero** dentro del motor (`number`, sin decimales).
   Se formatea solo al pintar. Evita errores de punto flotante en sumas de cartera.
5. **Degradación elegante.** Si el archivo no trae la hoja `cobranza`, los módulos de cartera
   y flujo se muestran deshabilitados con el mensaje de qué falta capturar. La app **no truena
   ni oculta silenciosamente**: informa.
6. Sin `any`. Sin `@ts-ignore`.

## Contrato de datos

El esquema canónico está en `src/lib/schema.ts`. **Es la fuente de verdad y coincide campo por
campo con la plantilla Excel entregada al cliente.** No renombrar, no agregar campos sin
actualizar la plantilla.

Hojas: `ventas`, `cobranza`, `gastos`, `parametros`.
Llave de relación: `ventas.folio` ←→ `cobranza.folio_venta`.

### Trampas de parseo (documentadas, ya nos costaron)

- **Importes en formato europeo**: `$ 444.800,00` → punto es separador de miles, coma es
  decimal. Normalizar: quitar `$` y espacios, quitar `.`, cambiar `,` por `.`.
- **Fechas en `dd/mm/aaaa`**. JavaScript las interpreta como `mm/dd`. Parsear explícitamente,
  nunca con `new Date(string)`.
- Valores basura esperados en celdas numéricas: `N/a`, `N/A`, `-`, `` (vacío), `$ - `.
- Espacios sobrantes en nombres de cliente y modelo → `.trim()` siempre.
- Modelos con distinta capitalización (`T70p` / `T70P`) deben normalizarse a mayúsculas
  antes de agrupar, o el reporte por modelo se duplica.

### Validación

Al cargar, mostrar un **panel de resultados de validación** con tres niveles:

- **Error** (bloquea el módulo afectado): folio duplicado, `cobranza.folio_venta` sin venta
  correspondiente, monto no numérico, fecha inválida.
- **Advertencia** (no bloquea): fila sin fecha, venta sin `dias_credito`, abono que excede el
  precio de venta, margen exactamente uniforme en más del 80% de las filas.
- **Info**: filas ignoradas por estar vacías, filas con `linea = "Demo"` excluidas del análisis.

Cada mensaje debe indicar **hoja, número de fila y qué corregir**. Un validador que solo dice
"archivo inválido" no sirve.

## Restricciones aprendidas

Reglas que ya costaron una sesión descubrir. Parecen arbitrarias y no lo son: si alguien
las "simplifica" sin leer el porqué, rompe el reporte en silencio.

- **La vacuidad de una fila se juzga SOLO sobre columnas de entrada.** Las columnas
  calculadas de la plantilla (`utilidad_bruta`, `margen_pct`, `cobrado`, `saldo`) son
  fórmulas que devuelven `0` y `""` en las ~280 filas de relleno: si se toman en cuenta,
  el lector cree que hay 300 ventas capturadas donde hay 21.
- **El parser CONSERVA las filas con `linea = "Demo"`.** Excluirlas es trabajo exclusivo
  del motor de cálculo. Si el lector las tira, el motor pierde la capacidad de listarlas
  aparte y el usuario nunca se entera de que existen.
- **`fecha_corte` nunca tiene valor por omisión dentro del motor.** Es un campo obligatorio
  de `OpcionesCartera` y `OpcionesInsights`, y ninguna función de `calc/` llama a
  `new Date()`. El default de "hoy" vive en la UI (`hoyUTC()`), no en el cálculo: si el
  motor lo tomara del reloj, el mismo archivo daría un aging distinto cada día y las
  pruebas del fixture caducarían solas. Las pruebas pasan `2026-09-09` explícitamente.

## Definiciones de cálculo (exactas, no reinterpretar)

```
utilidad_bruta        = precio_venta - costo_unitario
margen_pct            = utilidad_bruta / precio_venta
comision_monto        = comision_base === "No aplica" ? 0
                      : comision_base === "Utilidad"  ? comision_pct * utilidad_bruta
                      :                                 comision_pct * precio_venta
utilidad_contribucion = utilidad_bruta - comision_monto
cobrado(folio)        = suma de cobranza.monto donde folio_venta = folio
saldo                 = precio_venta - cobrado
dias_antiguedad       = fecha_corte - fecha_venta          // si no hay dias_credito
dias_vencido          = fecha_corte - (fecha_venta + dias_credito)  // si hay dias_credito
buckets               = 0-30, 31-60, 61-90, 91-180, +180   // sobre dias_vencido si existe,
                                                            // sobre dias_antiguedad si no
provision             = saldo_91_180 * provision_91_180 + saldo_mas_180 * provision_mas_180
DSO                   = (saldo_promedio / venta_periodo) * dias_periodo
ticket_promedio       = venta_total / numero_operaciones
attach_rate           = clientes con equipo Y accesorio / clientes con equipo
punto_equilibrio_mxn  = gastos_fijos / margen_contribucion_pct
```

**Filas con `linea = "Demo"` se excluyen de todo cálculo de venta**, pero se listan aparte.

`fecha_corte` = hoy por defecto, configurable por el usuario en la barra superior.

## Módulos de reporte

Cada uno es una ruta y una carpeta en `src/modules/`.

| # | Módulo | Requiere | Contenido |
|---|---|---|---|
| 1 | Resumen ejecutivo | ventas | Tarjetas KPI, hallazgos automáticos, alertas |
| 2 | Estado de resultados | ventas, gastos | Cascada venta→costo→bruta→comisión→gastos→resultado; mensual y acumulado |
| 3 | Ventas y flujo | ventas, cobranza | Facturado vs cobrado por mes, estacionalidad |
| 4 | Cobranza | ventas, cobranza | Aging por buckets, detalle de saldos, provisión, DSO |
| 5 | Rendimiento por producto | ventas | Unidades, ingreso, utilidad y margen por línea y modelo |
| 6 | Clientes | ventas | Concentración, recurrencia, exposición crediticia, attach rate |

**Hallazgos automáticos** (módulo 1): reglas que se disparan sobre los datos y generan texto.
Ejemplos que deben existir:
- Si `saldo_total > utilidad_bruta_total` → alerta roja "la utilidad del período está en cartera".
- Si un bucket +180 supera el 30% de la cartera → alerta roja con los clientes involucrados.
- Si el margen es idéntico en >80% de las filas → advertencia "el costo parece derivado del precio".
- Si `attach_rate < 40%` → oportunidad de venta cruzada.
- Si hay meses sin ventas → nota de estacionalidad.

Esta capa es lo que diferencia la app de una tabla dinámica. Vive en
`src/lib/calc/insights.ts` y es una lista de reglas declarativas, no `if` regados en la UI.

## Captura manual

Además de cargar archivo, el usuario debe poder capturar filas en la interfaz. Escribe al
**mismo store normalizado**. Una sola representación de datos, dos puertas de entrada.
Incluir exportación a Excel del dataset actual para que el cliente se lleve su archivo.

## Exportación a PDF

Vista imprimible con `@media print` y `window.print()`. No agregar Puppeteer ni librerías
pesadas. El PDF de referencia (11 páginas) define la estructura y el orden de secciones.

## Dirección visual

Sobrio y financiero, no dashboard de startup. Fondo blanco, azul marino `#1F3864` como color
institucional, verde `#1E8449` para positivo, rojo `#C0392B` para riesgo, ámbar `#B7791F` para
advertencia. Tipografía de sistema. Números tabulares (`font-variant-numeric: tabular-nums`)
en todas las tablas — sin eso las columnas de importes no alinean.

Densidad alta: quien lee esto compara cifras, no explora. Evitar tarjetas gigantes con un solo
número y mucho aire.

## Pruebas

`src/lib/calc/__tests__/` con el dataset real de 21 operaciones como fixture.

**Todos los valores de esta tabla son EXCLUYENDO la fila Demo (V-005).** El parser
entrega 21 ventas; el motor excluye la Demo y calcula sobre 20. Están en pesos:
el motor trabaja en centavos, así que multiplique por 100 al compararlos.

```
venta_total       = 5_498_800
costo_total       = 4_398_569
utilidad_bruta    = 1_100_231
margen            = 0.20
comision (s/venta)=   130_060
cobrado           = 3_717_600
saldo             = 1_781_200
operaciones       = 20
ticket_promedio   =   274_940
aging["+180"]     = 1_022_000
aging["31-60"]    =   721_200
aging["61-90"]    =    38_000
attach_rate       = 3/14
```

Referencia para no confundirse al depurar: **con la fila Demo incluida** el cobrado
sube a 4_112_800 (= 3_717_600 + 395_200 abonados a V-005) y el costo a 4_793_769
(= 4_398_569 + 395_200). Si obtiene esas cifras, el motor no está excluyendo la Demo.

No es un error de copiado que 395_200 aparezca dos veces: el costo unitario de V-005
y lo abonado contra ese folio coinciden. V-005 no tiene `precio_venta`, por eso
`venta_total` no cambia al incluirla — pero `costo_total` y `cobrado` sí.

Si un cambio rompe estos números, el cambio está mal.

## Orden de construcción

1. `schema.ts` + parser + validador, con pruebas.
2. Motor de cálculo completo, con pruebas contra el fixture. **Sin UI todavía.**
3. Shell de la app: carga de archivo, panel de validación, navegación.
4. Módulos 1 y 4 (los de mayor valor para el cliente).
5. Módulos 2, 3, 5, 6.
6. Captura manual y exportación.

No pasar al siguiente paso con pruebas en rojo.

## Fuera de alcance en v1

Autenticación, multi-usuario, persistencia, histórico entre cortes, conexión a Odoo,
multi-moneda, consolidación de varias empresas. Todo eso es v2 y la arquitectura debe
permitirlo sin reescribir el motor de cálculo.
