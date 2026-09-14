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

1. **Nunca usar `localStorage`, `sessionStorage` ni `IndexedDB`** para datos. Estado en memoria.

   **Única excepción, desde v1.1 — preferencias de interfaz.** Se permite persistir
   **preferencias de interfaz** —tema, y más adelante idioma y disposición—. **Nunca datos
   financieros, datasets, parámetros de cálculo ni nada derivado de un archivo cargado.**

   La excepción vive encapsulada en `src/lib/preferencias/`, con una **lista blanca de claves**:
   `guardarPreferencia` solo acepta claves de esa lista y valores de esa clave, así que guardar
   cualquier otra cosa **no compila**. Una prueba recorre `src/` y exige que ningún otro archivo
   mencione `localStorage`, para que nadie pueda saltarse el módulo. Ampliar la excepción
   obliga a editar ese archivo y a leer por qué existe.
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
  decimal. Normalizar: quitar `$` y espacios, quitar `.`, cambiar `,` por `.`. Un texto con
  otra gramática (`1,234.56`, `1234.56`, `1.50`) **no se adivina**: se rechaza como importe
  ilegible. Normalizado con la regla de arriba valdría $1.23, $123,456 y $150, sin aviso.
- **Fechas en `dd/mm/aaaa`**. JavaScript las interpreta como `mm/dd`. Parsear explícitamente,
  nunca con `new Date(string)`. El serial de Excel se toma sin la hora, y una fecha fuera de
  1990–2100 no se lee: un serial 45 sería el 13 de febrero de 1900.
- Valores basura esperados en celdas numéricas: `N/a`, `N/A`, `-`, `` (vacío), `$ - `.
- Espacios sobrantes en nombres de cliente y modelo → `.trim()` siempre.
- Modelos con distinta capitalización (`T70p` / `T70P`) deben normalizarse a mayúsculas
  antes de agrupar, o el reporte por modelo se duplica.
- **Porcentajes**, en `comision_pct` y en los parámetros: `30%`, `30`, `0.30` y `0,30` son
  30% (`parsePct`). Un número mayor que 1 se lee como por ciento, nunca como 3000%, y `1` solo
  es 100%: para uno por ciento se escribe `1%`. La regla está escrita en INSTRUCCIONES y en las
  notas de `parametros` de la plantilla, porque es la que el usuario tiene que conocer.

### Validación

Al cargar, mostrar un **panel de resultados de validación** con tres niveles:

- **Error** (bloquea el módulo afectado): folio duplicado, `cobranza.folio_venta` sin venta
  correspondiente, monto que no se puede leer (incluido un importe con otra gramática que la
  europea), fecha inválida o fuera de 1990–2100.
- **Advertencia** (no bloquea): fila sin fecha, venta sin `dias_credito`, abono que excede el
  precio de venta, margen exactamente uniforme en más del 80% de las filas, valor de una
  columna de lista que no es ninguna de sus opciones (se toma como celda vacía y se dice qué
  se aplicó), parámetro capturado que no se puede leer, con un nombre que no es del
  contrato, repetido o sin nombre (se aplica su valor por omisión o se ignora, y se dice
  qué se capturó, qué se aplicó y qué formatos se aceptan; si el parámetro mueve cifras, el aviso
  aparece además junto a la cifra y en el bloque Alcance de la portada del PDF), `dias_credito`
  que no es un entero no negativo (se mide por antigüedad, como sin `dias_credito`), porcentaje
  que no se puede leer o fuera de 0–100% (la venta va sin comisión, como con la celda vacía).
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
- **Las columnas de lista llegan al motor con la grafía del contrato o vacías, nunca con
  otro valor.** `ENUMERACIONES` (`schema.ts`) declara las seis —`linea`, `comision_base`,
  `condicion`, `metodo`, `categoria`, `tipo`— con lo que recibe su celda vacía. `canonizar`
  ignora mayúsculas, espacios y acentos («demo» → `Demo`, «Crédito» → `Credito`); lo que ni
  así es de la lista recibe lo de la celda vacía, y una advertencia dice qué se capturó y qué
  se aplicó. `comision_base_default` sigue el mismo criterio. El motor compara exacto: sin
  esto, una fila «demo» se contó como venta y «utilidad» cobró la comisión sobre el precio,
  mientras el panel callaba o afirmaba lo contrario. Canonizar no es excluir: la fila se
  conserva.
- **La hoja `parametros` se valida como las de datos: ningún valor capturado se descarta sin
  un hallazgo.** `src/lib/parse/parametros.ts` declara cómo se lee cada parámetro y qué
  formatos acepta; `validate()` y la regla `parametro-no-reconocido` consultan esa misma
  declaración. Lo que no se puede leer toma su valor por omisión y el panel dice qué se
  capturó, qué se aplicó y qué formatos se aceptan. Una clave desconocida, repetida o un valor
  sin nombre también se avisan. Los parámetros son lo único que el usuario configura a mano:
  un 30% leído como 25% sin aviso es su decisión descartada en silencio.
- **Toda coerción y toda canonización del contrato vive en el esquema (`src/lib/schema.ts`), y
  ningún consumidor interpreta valores crudos.** El motor, los selectores y la interfaz reciben
  el dataset ya coercionado y no vuelven a leer lo que el usuario escribió. El validador sí mira
  la celda cruda, pero solo para preguntarle al esquema si pudo leerla, nunca con una coerción
  propia; `src/lib/parse/parametros.ts` solo elige qué coerción del esquema lee cada parámetro y
  redacta los mensajes. Los cuatro defectos de la serie 1.1.1–1.1.4 fueron **el mismo error de
  diseño**: el contrato prometía algo que el esquema no verificaba, y cada consumidor coercionaba
  por su cuenta.
  1. **`linea` «demo» (1.1.1).** El validador comparaba sin mayúsculas y el motor exacto: el
     panel decía «excluida» y el motor la contaba como venta.
  2. **`comision_base` «utilidad» (1.1.2).** El motor comparaba exacto y cobraba la comisión
     sobre el precio; `comision_base_default` no reconocido caía a «Venta» sin aviso.
  3. **La hoja `parametros` (1.1.3).** `validate()` coercionaba cada parámetro con su propia
     regla y lo ilegible caía a su valor por omisión en silencio: «30%» se aplicaba como 25%.
  4. **Las hojas de datos (1.1.4).** `dias_credito` con `Number()`: «30dias» entraba al dataset
     como NaN, y «-5» o «30.5» se usaban tal cual en el aging. El motor protegía el aging contra
     NaN por su cuenta, que es justo el patrón. También `comision_pct` sin rango (150%),
     importes con otra gramática leídos en silencio («1,234.56» como $1.23) y seriales de fecha
     sin rango ni hora (45 → 1900).

  Ampliar el contrato es ampliar el esquema. Una lectura nueva escrita en otro lugar sería el
  quinto caso.
- **`fecha_corte` nunca tiene valor por omisión dentro del motor.** Es un campo obligatorio
  de `OpcionesCartera` y `OpcionesInsights`, y ninguna función de `calc/` llama a
  `new Date()`. El default de "hoy" vive en la UI (`hoyUTC()`), no en el cálculo: si el
  motor lo tomara del reloj, el mismo archivo daría un aging distinto cada día y las
  pruebas del fixture caducarían solas. Las pruebas pasan `2026-09-09` explícitamente.
- **El parámetro `?fixture=demo` es exclusivo de desarrollo, y su guarda no es cosmética.**
  Carga el archivo de demostración y fija el corte en `2026-09-09` para que `/verificar` recorra
  la matriz de anchos y temas sin intervención humana. `src/main.tsx` lo importa dentro de
  `if (import.meta.env.DEV)`: en `build`, Vite sustituye esa expresión por `false`, Rollup
  elimina la rama y el chunk dinámico nunca se emite, así que en producción el módulo no queda
  inerte, queda **ausente**. La ruta del archivo es un import estático `?url` y **nunca sale de
  la query** —lo que viaja en la URL es una bandera que se compara contra un literal—, por eso no
  puede cargar una ruta arbitraria. Una prueba guardián
  (`src/dev/__tests__/fixtureDesarrollo.test.ts`) exige las dos cosas; quitar cualquiera de las
  dos publicaría un cargador de archivos en una aplicación cuyo argumento de venta es que los
  datos no salen del navegador.

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

`fecha_corte` **no tiene valor por omisión en el cálculo**: toda función de `calc/` la recibe
explícita. El "hoy" por defecto lo pone la UI al arrancar (`fechaCorte: hoyUTC()` en el store) y
el usuario lo cambia en la barra superior. Ver «Restricciones aprendidas».

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
pesadas. La estructura y el orden de secciones los define `docs/linea-base-pdf.md`, que es la
línea base contra la que `/verificar` compara el PDF generado.

## Dirección visual

Sobrio y financiero, no dashboard de startup. Fondo blanco, azul marino `#1F3864` como color
institucional, verde `#1B7A42` para positivo, rojo `#C0392B` para riesgo, ámbar `#A15F07` para
advertencia. Tipografía de sistema. Números tabulares (`font-variant-numeric: tabular-nums`)
en todas las tablas — sin eso las columnas de importes no alinean.

Densidad alta: quien lee esto compara cifras, no explora. Evitar tarjetas gigantes con un solo
número y mucho aire.

### Temas (v1.1)

Tres estados de preferencia —**claro, oscuro, sistema**—; `data-tema` en el `<html>` lleva
siempre el **resuelto**, nunca "sistema". Con "sistema" elegido la aplicación sigue a
`prefers-color-scheme` **en vivo**, no solo al cargar.

- **`src/index.css` es el único lugar del proyecto con hexadecimales.** El tema oscuro se hace
  redefiniendo los mismos tokens bajo `html[data-tema="oscuro"]`, incluida la rampa neutra de
  Tailwind, no con `dark:` repartido por los componentes.
- **Los tonos semánticos tienen variantes propias en oscuro.** Reusar `#C0392B` sobre fondo
  oscuro lo baja a 3.8:1 y deja de leerse como alarma. El texto que va **encima** de un tono
  sólido (`sobre-color`) se invierte de blanco a casi negro.
- **Contraste WCAG AA obligatorio** (4.5:1 texto, 3:1 objetos gráficos) en **los dos temas**,
  verificado por prueba sobre `index.css`. La tabla vive en `docs/contraste.md` y la regenera
  `npm run test`.
- **La impresión siempre sale en claro**, sea cual sea el tema de la pantalla. `VistaImpresion`
  marca su raíz con `data-tema="claro"` y `@media print` fuerza los tokens claros.
- **Las gráficas reciben los tokens resueltos** del tema que rige **donde se pintan** —no los
  del `<html>`—, incluidos ejes, rejilla, rótulos y tooltip. Es lo que hace que el PDF salga
  claro aunque la pantalla esté en oscuro.

### Layout (v1.1)

**El layout responde al CONTENIDO, no al dispositivo.** Nada de puntos de corte por ancho de
pantalla: rejillas con `auto-fit` y `minmax()`, y consultas de **contenedor** donde hace falta
decidir. La misma tabla puede vivir en una columna de 480 px dentro de una pantalla de 1440, y
lo que manda es el espacio que tiene, no el que tiene la ventana.

- **Cada bloque declara su mínimo** (`Seccion minimo=…`) y la rejilla decide quién comparte
  renglón. No hay una lista de parejas escrita a mano.
- **En poco ancho, dos estrategias de tabla, y el módulo elige** (`TablaCifras enEstrecho`):
  las de **resumen** —pocas columnas, un renglón por concepto— se vuelven tarjetas; las de
  **detalle** —una fila por operación— conservan la tabla, se desplazan a lo ancho y fijan la
  primera columna. **Apilar una tabla de detalle destruye la comparación de cifras, que es el
  contenido.**
- **Una gráfica de categorías recorta a las que caben legibles y declara lo omitido** con su
  número y su proporción del ingreso. El eje de tiempo no se recorta nunca: se bajan las
  marcas. Ver `docs/decisiones.md`.
- **Objetivo táctil**: 44 px reales en barra de herramientas y navegación; dentro de las
  tablas, 44 px solo con `pointer: coarse`, porque con renglones de 26 px dos áreas de 44 se
  pisan y el toque abre la fila equivocada.
- **La impresión es un contexto de ancho fijo**: ninguna regla responsiva la alcanza. En
  `@media print` el layout es el de escritorio y la gráfica no recorta.

## Pruebas

`src/lib/calc/__tests__/` con el **archivo de demostración ficticio** como fixture
(`docs/DEMO_Agrodrones_Bajio_FICTICIO.xlsx`). Ningún archivo con datos reales de un cliente
entra al repositorio, ni siquiera como fixture (GOBERNANZA.md, sección 10).

**Todos los valores de esta tabla son EXCLUYENDO la fila Demo (V-006), al corte
`2026-09-09`.** El parser entrega 25 ventas; el motor excluye la Demo y calcula sobre 24. Están
en pesos: el motor trabaja en centavos, así que multiplique por 100 al compararlos. La fuente
es `src/lib/calc/__tests__/fixture.ts`; esta tabla es su copia legible.

```
operaciones             =    24
venta_total             = 4_496_900
costo_total             = 3_278_000
utilidad_bruta          = 1_218_900
margen                  = 0.2711
comisiones              =   146_150
utilidad_contribucion   = 1_072_750
cobrado                 = 2_541_100
saldo                   = 1_955_800
gastos_fijos            =   640_800
gastos_variables        =   360_100
resultado_operativo     =    71_850
ticket_promedio         =   187_370.83
punto_equilibrio / mes  =   298_465.89   // el del periodo entre los 9 meses del eje
aging["0-30"]           =   683_000
aging["31-60"]          =    94_800
aging["61-90"]          =   390_000
aging["91-180"]         =   118_000
aging["+180"]           =   670_000
aging["sin-fecha"]      =         0
attach_rate             = 3/10 = 0.30
```

**El corte es obligatorio y fijo.** El aging depende de él: con "hoy" la suite empezaría a
fallar sola con el paso de los días. Las pruebas pasan `2026-09-09` explícitamente.

Referencia para no confundirse al depurar: **con la fila Demo incluida** el costo sube a
3_573_000 y el cobrado a 2_836_100. Si obtiene esas cifras, el motor no está excluyendo la
Demo. `venta_total` no cambia al incluirla porque V-006 no tiene `precio_venta` — solo el
costo y lo abonado contra ese folio.

Este archivo ejercita a propósito los casos límite que el archivo del cliente nunca tocó:
los **cinco tramos de antigüedad con saldo**, base de medición **mixta** (ventas con
`dias_credito` y sin él), las **seis líneas** de producto incluida la Demo, un **sobrecobro**
(V-018, saldo negativo) y una **venta sin fecha** (V-025).

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
