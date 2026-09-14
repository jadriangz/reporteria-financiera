# Notas de versión

Qué cambió en cada versión, dicho para quien ya usa la aplicación: qué estaba mal, qué va a
ver distinto y si alguna cifra suya puede moverse al recargar el mismo archivo.

GOBERNANZA.md, sección 3: una corrección que mueve cifras es PARCHE si el código por fin cumple
la especificación, pero **se anuncia igual**. Si el socio vio una cifra el mes pasado y hoy ve
otra, la explicación tiene que estar escrita. Es esta.

La más reciente va arriba. El razonamiento de cada decisión está en `docs/decisiones.md`.

---

## 1.1.4 — PARCHE — 2026-09-14

Cierra la serie de parches del contrato de datos (1.1.1 a 1.1.4).

### Qué estaba mal

- Un parámetro que no se podía leer ya se avisaba en el panel de validación (desde 1.1.3),
  pero **el panel no viaja con el PDF**. Un reporte calculado con la provisión por omisión
  cuando se capturó un 30% ilegible no lo decía en el papel.
- `dias_credito` se leía sin validar. «30dias» entraba al dataset como un valor inválido, y
  «-5» o «30.5» se usaban tal cual para el vencimiento. Nada lo avisaba.
- `comision_pct` aceptaba cualquier porcentaje: «150» se aplicaba como 150% y «-5%» como una
  comisión negativa.
- Un importe escrito como **texto** con otra gramática que la europea se leía mal y en
  silencio: «1,234.56» como $1.23, «1234.56» como $123,456 y «1.50» como $150.
- Una fecha fuera de rango se aceptaba: el serial 45 es el 13 de febrero de 1900. Y una celda
  de fecha y hora conservaba la hora.

### Qué cambia si ya usaba la aplicación

- **Un parámetro que no se pudo leer se avisa donde se usa**: bajo los controles de provisión
  (en Cobranza y en la barra superior), bajo el DSO, junto al periodo del Resumen y de la
  portada, en la tarjeta de IVA y bajo la cascada del Estado de resultados. Además, **el bloque
  Alcance de la portada del PDF** trae la lista «Parámetros que no se pudieron leer», con lo
  que se capturó y el valor que se aplicó. Si ajusta ese parámetro desde la aplicación, su
  aviso desaparece: el valor ya es decisión suya.
- **Advertencias nuevas en el panel**: `dias_credito` que no es un número entero de días, y
  porcentaje que no se puede leer o que está fuera de 0–100%.
- **Errores nuevos en el panel**: importe escrito con otra gramática que la europea, y fecha
  fuera de 1990–2100. Antes esas celdas se leían mal sin ningún aviso.
- **`comision_pct` ilegible pasó de error a advertencia. Si recarga el mismo archivo va a ver
  menos errores**, y no es porque algo de su archivo se haya corregido. Antes el panel marcaba
  un porcentaje como «abc» como error, y la leyenda del panel dice que un error bloquea el
  módulo. No bloqueaba nada: la venta ya se calculaba con esa comisión en cero. Ahora la
  severidad dice la consecuencia real —la venta se calcula sin comisión, igual que con la celda
  vacía— y el aviso sigue ahí, con la fila y qué escribir. Las cifras no cambian por esto.
- Los importes capturados como número de Excel no cambian: la gramática solo aplica al texto.
  Las fechas de Excel entre 1990 y 2100 tampoco, salvo la hora, que ahora se descarta.

### ¿Pueden moverse sus cifras?

Sí, pero solo si su archivo tenía alguno de estos casos:

| Si su archivo tenía… | Antes | Ahora | Qué puede moverse |
|---|---|---|---|
| `dias_credito` negativo o con decimales («-5», «30.5») | se usaba para el vencimiento | la venta se mide por antigüedad | antigüedad y tramo de esa venta, provisión |
| `dias_credito` con texto («30dias») | valor inválido; la antigüedad ya se medía desde la venta | vacío; se mide desde la venta | ninguna cifra. Si ninguna venta traía días de crédito válidos, el Alcance ahora lo dice |
| `comision_pct` fuera de 0–100% («150», «-5%») | se aplicaba | vacío: la venta va sin comisión | comisiones, utilidad de contribución, resultado operativo, punto de equilibrio |
| `comision_pct` con texto («abc») | error; comisión cero | advertencia; comisión cero | ninguna |
| `precio_venta` como texto con otra gramática | leído mal | error; la venta queda fuera, listada como «sin precio» | venta total, costo, utilidad, cartera, producto, clientes, flujo |
| `costo_unitario` como texto con otra gramática | leído mal | error; **la venta se calcula con costo cero** hasta que se corrija | costo, utilidad bruta y margen, que salen sobrevaluados mientras el error esté abierto |
| `cobranza.monto` como texto con otra gramática | leído mal | error; el abono no suma | cobrado, saldo, antigüedad, provisión, flujo |
| `gastos.monto` como texto con otra gramática | leído mal | error; el gasto no se suma | gastos, resultado operativo, punto de equilibrio |
| Fecha fuera de 1990–2100 | fecha de 1900 o de otro siglo | error; la fila queda sin fecha | antigüedad y tramo de esa venta (pasa a «sin fecha»), análisis mensual, flujo |
| Fecha de Excel con hora | se conservaba la hora | solo el día | la antigüedad de esa venta gana un día y puede cambiar de tramo si estaba en el límite |

Los avisos de parámetros no leídos no mueven ninguna cifra: dicen con qué valor se calculó.

---

## 1.1.3 — PARCHE — 2026-09-14

### Qué estaba mal

La hoja `parametros` no tenía validación. Un valor que no se podía leer caía a su valor por
omisión sin aviso, y algunos se leían mal:

- `provision_91_180` «30%» se aplicaba como 25%, el valor por omisión.
- `provision_91_180` 30 (sin %) se aplicaba como 3000%.
- `tasa_iva` «16» se leía como 1600%.
- `periodo_inicio` «2026-01-01» se perdía.
- `importes_incluyen_iva` «Sí incluye» quedaba sin contestar.
- Un nombre de parámetro mal escrito, repetido, o un valor sin nombre se descartaban sin aviso.

### Qué cambia si ya usaba la aplicación

- **Porcentajes** (`tasa_iva` y las dos provisiones): «30%», «30», «0.30» y «0,30» son 30%. Un
  número mayor que 1 se lee como por ciento, y «1» solo es 100%: para uno por ciento se escribe
  «1%». Fuera de 0–100% no se lee. La regla está escrita en INSTRUCCIONES y en las notas de la
  hoja `parametros` de la plantilla descargable.
- **Fechas del periodo**: dd/mm/aaaa o fecha de Excel, entre 1990 y 2100.
- **`moneda_base`**: solo MXN. **`dias_credito_default`**: entero no negativo.
  **`tipo_cambio_usd`**: mayor que cero.
- Todo valor que no se pueda leer produce una **advertencia** con lo capturado, el valor que se
  aplicó y los formatos aceptados. También se avisan un nombre que no es parámetro, un parámetro
  repetido (se aplica la última fila, igual que antes) y un valor sin nombre.

### ¿Pueden moverse sus cifras?

Sí. Salvo que haya ajustado las provisiones a mano en la aplicación, porque entonces el reporte
usa su ajuste:

| Si su archivo tenía… | Antes | Ahora | Qué puede moverse |
|---|---|---|---|
| Provisión con signo % («30%») | valor por omisión (25% o 50%) | el capturado | provisión, utilidad ajustada |
| Provisión como número mayor que 1 (30, «30») | 3000% | 30% | provisión, utilidad ajustada |
| Provisión fuera de 0–100% | se aplicaba | valor por omisión, con aviso | provisión, utilidad ajustada |
| `tasa_iva` mayor que 1 (16, «16») | 1600% | 16% | cifras sin IVA de la tarjeta de IVA |
| `tasa_iva` con signo % distinto de 16 («8%») | 16%, por omisión | el capturado | cifras sin IVA de la tarjeta de IVA |
| Fecha de periodo como número fuera de 1990–2100 | una fecha absurda | vacía, con aviso: el periodo se toma de las ventas | periodo del Resumen, días del DSO |

`moneda_base`, `dias_credito_default` y `tipo_cambio_usd` no mueven cifras: ningún cálculo los
usa hoy. `importes_incluyen_iva` se lee igual que antes; solo se avisa si no se entiende.

---

## 1.1.2 — PARCHE — 2026-09-13

### Qué estaba mal

- `comision_base` «utilidad» cobraba la comisión sobre el **precio**: en el caso de prueba,
  cinco veces la cifra correcta. «no aplica» la cobraba en vez de anularla.
- `comision_base_default` «utilidad» se descartaba sin aviso y quedaba «Venta».
- Un valor fuera de la lista en una columna de lista («Accesorio» en vez de «Accesorios») se
  usaba tal cual, sin aviso.

### Qué cambia si ya usaba la aplicación

- Las seis columnas de lista (`linea`, `comision_base`, `condicion`, `metodo`, `categoria`,
  `tipo`) y `comision_base_default` se reconocen sin importar mayúsculas, espacios ni acentos:
  «NO APLICA», « utilidad », «Crédito».
- Un valor que ni así es de la lista recibe lo mismo que la celda vacía, y una **advertencia**
  dice qué se capturó y qué se aplicó:

  | Columna | Lo que se aplica |
  |---|---|
  | `linea` | Equipo |
  | `comision_base` | la base de la hoja parámetros |
  | `tipo` | Fijo |
  | `condicion`, `metodo`, `categoria` | vacío |

### ¿Pueden moverse sus cifras?

Sí, en estos casos:

| Si su archivo tenía… | Antes | Ahora | Qué puede moverse |
|---|---|---|---|
| `comision_base` con otra capitalización o espacios («utilidad», «no aplica») | comisión sobre el precio | la fórmula de su base | comisiones, utilidad de contribución, resultado operativo, punto de equilibrio |
| `comision_base` fuera de la lista («Utilida») | comisión sobre el precio | la base de parámetros, con aviso | lo mismo, salvo que la base de parámetros sea Venta |
| `comision_base_default` con otra capitalización | Venta | la capturada | comisiones de las ventas sin base propia |
| `linea` fuera de la lista («Accesorio») | una línea propia, que no contaba como accesorio | Equipo, con aviso | Rendimiento por producto, attach rate |
| `linea` «Démo», con acento | se contaba como venta | se excluye como Demo | lo mismo que en 1.1.1 |
| `categoria` fuera de la lista | su propio renglón en el desglose de gastos | «Sin categoría» | solo el desglose; los totales no cambian |

`tipo` fuera de la lista ya se trataba como Fijo: no cambia. `condicion` y `metodo` no entran a
ningún cálculo.

---

## 1.1.1 — PARCHE — 2026-09-13

### Qué estaba mal

Una venta con `linea` «demo» o «DEMO» se contaba como venta, mientras el panel de validación
afirmaba haberla excluida. No había error ni advertencia.

### Qué cambia si ya usaba la aplicación

`linea` se reconoce sin importar mayúsculas ni espacios. La fila Demo se excluye del análisis
de venta y se lista aparte, como el panel siempre dijo.

### ¿Pueden moverse sus cifras?

Solo si alguna fila tenía `linea` escrita distinto de «Demo»:

- **Con precio capturado:** esa unidad sale de la venta total, el costo, la utilidad, las
  comisiones, la cartera, Producto, Clientes y el flujo. También puede cambiar la advertencia de
  margen uniforme, que antes contaba esa fila.
- **Sin precio:** ya quedaba fuera, listada como «sin precio». Ahora se lista como «Demo», y
  ninguna cifra se mueve.

---

## Entre 1.1.0 y 1.1.1 — sin versión propia

Cambios que no llevan número porque no tocan el contrato ni las cifras. No mueven ninguna cifra.

- **Plantilla descargable.** Su XML estaba mal formado en `ventas`, `cobranza` y `gastos`
  (1,297 filas sin cerrar), y Excel podía pedir repararla al abrirla. Se reparó conservando
  estilos, listas desplegables y paneles fijos. Además:
  - Se quitó la lista de modelos del cliente de drones: `modelo` es texto libre.
  - El punto 5 de INSTRUCCIONES explica que el modelo se escribe siempre igual.
  - La fila de ejemplo dice «Modelo A», en la plantilla y en el Excel exportado.
- **Herramientas internas**, sin efecto para quien usa la aplicación: los comandos de
  verificación del proyecto, un parámetro de desarrollo que no existe en producción y la línea
  base del PDF.

---

## 1.1.0 — MENOR — 2026-09-12

### Qué cambia si ya usaba la aplicación

- **Temas claro, oscuro y sistema.** La aplicación recuerda el tema elegido en este navegador.
  Es la única preferencia que se guarda; ningún dato financiero se guarda en ningún lado.
- **El PDF sale siempre en claro**, sea cual sea el tema de la pantalla.
- **La pantalla se acomoda al espacio disponible.** En poco ancho, las tablas de resumen se
  vuelven tarjetas, y las de detalle se desplazan a lo ancho con la primera columna fija.
- **Las gráficas por categoría** muestran las que caben legibles y declaran cuántas omitieron y
  qué proporción del ingreso representan. El eje de tiempo nunca se recorta.
- **El panel de validación** llega comprimido, con un encabezado cuyo tono resume la
  severidad. Con errores nunca queda reducido.

### ¿Pueden moverse sus cifras?

No. Solo cambió la interfaz.

---

## 1.0.0 — 2026-09-11

Primera versión.

- Carga de Excel o CSV con ventas, cobranza, gastos y parámetros, con validación en tres
  niveles —error, advertencia, información— que cita hoja y fila.
- Seis módulos:
  1. Resumen ejecutivo con hallazgos automáticos.
  2. Estado de resultados.
  3. Ventas y flujo.
  4. Cobranza, con antigüedad, provisión y DSO.
  5. Rendimiento por producto.
  6. Clientes.
- Captura manual de filas, exportación del dataset a Excel y reporte en PDF desde el navegador.
- Todo el procesamiento ocurre en el navegador: ningún dato sale del equipo.
