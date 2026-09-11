# Registro de decisiones

Toda decisión de diseño con alternativas razonables, en el formato de
`GOBERNANZA.md` sección 9. Una entrada por decisión, en orden cronológico.

Existe para que dentro de seis meses nadie borre las filas `Demo` "para
simplificar" sin saber por qué estaban ahí.

---

## 2026-09-09 — Los escenarios de provisión son fijos, no configurables

**Contexto.** El módulo de Cobranza muestra cuatro escenarios de provisión —Sin
provisión, Moderado, Conservador, Pesimista— y además dos parámetros de tasa que
el usuario puede mover en la barra superior. Coexistiendo, se confundían: no era
claro si los escenarios reflejaban lo que el usuario había configurado o eran
otra cosa.

**Decisión.** Los cuatro escenarios son referencias **fijas**, con tasas
hardcodeadas en `ESCENARIOS` (`src/modules/cobranza/selectores.ts`). No dependen
de la hoja `parametros` ni de los controles. Lo que el usuario aplica va en su
propia fila al final de la tabla, "Tasas aplicadas", y ahí sí se mueve.

**Alternativa descartada.** Que los cuatro escenarios reflejaran los parámetros
vigentes. Se descartó porque destruye la razón de existir de la tabla: los
escenarios están para mostrar el **rango** de la exposición —desde "no se pierde
nada" hasta "se pierde todo lo de más de 180 días"— independientemente de lo que
el usuario decidió provisionar.

**Consecuencia.** La tabla es comparable entre reportes de distintos meses y
entre distintos clientes. Cada escenario tiene tasas mayores o iguales que el
anterior en **ambos** tramos, de modo que la provisión nunca baja de un escenario
al siguiente: un peor caso que saliera menos malo que el conservador destruiría
la credibilidad del reporte. Hay una prueba que lo exige.

---

## 2026-09-09 — El parser conserva las filas `linea = "Demo"`

**Contexto.** Una unidad marcada como Demo no es una venta: no tiene precio, su
costo no tiene ingreso asociado y contarla distorsiona margen, ticket promedio y
cartera. Lo obvio sería descartarla al leer el archivo.

**Decisión.** El **lector** (`src/lib/parse/`) conserva esas filas tal cual. El
**motor** (`particionarVentas`, en `src/lib/calc/base.ts`) es quien las excluye
de todo cálculo de venta y las devuelve aparte, en `excluidas`, con su motivo.

**Alternativa descartada.** Descartarlas en el parser. Se descartó porque el
motor perdería la capacidad de listarlas: el usuario nunca se enteraría de que
existen ni de cuánto costo tiene apartado en unidades que no vendió. La regla de
insight `filas-demo` justamente dice "1 unidad marcada como Demo por $295,000 de
costo que no tiene venta asociada: conviene decidir si es gasto de promoción o
inventario", y ese hallazgo solo es posible si la fila llegó.

**Consecuencia.** `dataset.ventas` trae más filas que operaciones computables, y
esa diferencia es intencional. Toda función del motor que recorra ventas tiene
que pasar por `particionarVentas` primero. El separador entre "lo que el archivo
dice" y "lo que el reporte calcula" queda en el motor, no en el lector, que es
además lo que permitirá cambiar la fuente de datos a Odoo sin reescribir reglas.

---

## 2026-09-09 — La vacuidad de una fila se juzga solo sobre columnas de entrada

**Contexto.** La plantilla trae columnas calculadas con fórmulas de Excel
(`utilidad_bruta`, `margen_pct`, `cobrado`, `saldo`) y esas fórmulas están
estiradas hasta la fila 301 para comodidad de quien captura. En las ~280 filas
sin capturar, `IFERROR(H-G,"")` devuelve `0` y `""`. Una fila vacía **no se ve
vacía** para un lector ingenuo.

**Decisión.** Las columnas calculadas se descartan al leer
(`COLUMNAS_CALCULADAS`, en `src/lib/parse/readWorkbook.ts`) y la vacuidad de una
fila se juzga **solo** sobre las columnas de entrada. Se descartan además la fila
de ejemplo, por folio sentinela (`V-000` / `P-000` / `G-000`) y no por posición,
y las filas de nota al pie sin folio ni importe.

**Alternativa descartada.** Juzgar la vacuidad sobre la fila completa. Se
descartó porque produce un reporte que afirma 300 ventas donde hay 24. No es un
error visible en ninguna suma —los importes son cero—, pero el conteo de
operaciones, el ticket promedio y todo porcentaje por operación quedan mal.

**Consecuencia.** El motor nunca ve un valor precalculado por Excel: recalcula
todo desde las columnas de entrada. Si el cliente sobrescribe una fórmula con un
número a mano, se ignora, que es lo correcto: la cifra del reporte tiene que
salir del mismo cálculo siempre. El lector informa cuántas filas ignoró, para
que la diferencia entre "el archivo tiene 301 renglones" y "se leyeron 24" sea
visible y no un misterio.

---

## 2026-09-10 — La fecha de corte usa el día local, y el motor nunca la inventa

**Contexto.** `fecha_corte` decide toda la antigüedad de cartera. Tomarla de
`new Date()` en UTC hacía que, en México (UTC−6), entre las 18:00 y la
medianoche la app usara ya el día siguiente: el mismo archivo, abierto la misma
tarde, daba un aging distinto según la hora.

**Decisión.** Dos partes, y las dos importan:

1. El **motor nunca llama a `new Date()`**. `fecha_corte` es un campo
   obligatorio de `OpcionesCartera` y `OpcionesInsights`, y entra siempre por
   parámetro.
2. El **valor por omisión vive en la UI**, en `hoyUTC()`, que toma el día, mes y
   año **locales** del reloj del usuario y los arma como medianoche UTC.

**Alternativa descartada.** Que el motor tomara "hoy" cuando no le pasaran
corte. Se descartó por dos razones: el mismo archivo daría un reporte distinto
cada día sin que nada lo explique, y las pruebas del fixture caducarían solas
—de hecho una venta del fixture cruza de 31-60 a 61-90 a mediados de septiembre—.
Las pruebas pasan `2026-09-09` explícitamente.

**Consecuencia.** El reporte es reproducible: mismo archivo más mismo corte da
siempre las mismas cifras, hoy y en un año. El usuario puede además mover el
corte en la barra superior y ver el aging a cualquier fecha. Ninguna función de
`src/lib/calc/` puede llamar al reloj; si alguna lo hiciera, rompería la
reproducibilidad sin romper ninguna prueba, así que la regla se documenta aquí y
en `CLAUDE.md`.

---

## 2026-09-11 — El aging neta los sobrecobros en vez de descartarlos

**Contexto.** Una venta cuyos abonos superan el precio deja saldo negativo. El
aging sumaba al bucket únicamente los saldos **positivos**, con el argumento de
que una venta sobrepagada no es cartera.

**Decisión.** Al aging entra todo saldo distinto de cero, con su signo. Un
sobrecobro resta en el tramo que le toca por antigüedad.

**Alternativa descartada.** Seguir descartando los negativos. Se descartó porque
rompe una identidad que el reporte afirma en varios lugares: la suma de los
buckets **es** el saldo total. Con un sobrecobro de $200, los buckets sumaban
$1,956,000 contra un saldo total de $1,955,800; la tabla de antigüedad decía
tener $200 de cartera que no existen, y la columna de participaciones sumaba más
de 100%. El archivo del cliente no tenía sobrecobros, así que el defecto nunca se
manifestó.

**Consecuencia.** Un bucket puede quedar en negativo, y eso es la verdad: a ese
cliente se le debe dinero. La identidad `Σ buckets === saldoTotal` es ahora un
invariante con prueba, igual que `cobrado + saldo === venta`. Ninguna cifra que
el cliente haya visto cambia: su archivo no tenía sobrecobros.

---

## 2026-09-11 — Ausencia de línea de accesorios no es attach rate bajo

**Contexto.** La regla `attach-rate-bajo` comparaba la tasa contra el 40% y se
disparaba por debajo. Un negocio que no vende accesorios da tasa 0, así que la
regla concluía "0%, oportunidad de venta cruzada" y proponía vender un catálogo
que no existe. Es el mismo error que ya se había corregido en cartera, donde sin
abonos capturados el motor no puede afirmar nada del saldo.

**Decisión.** La regla exige al menos una operación de la línea Accesorios en el
periodo (`attachRate.operacionesAccesorio > 0`). Sin ella, no se dispara. Las
tarjetas de la vista de Clientes muestran `n/d` y dicen que la métrica no aplica,
en vez de pintar un 0% en ámbar.

**Alternativa descartada.** Devolver `tasa: null` desde el motor cuando no hay
accesorios. Se descartó porque 0 sí es el valor correcto de la división: lo que
falta no es el número, es el sentido. Mezclar las dos cosas en un `null` haría
imposible distinguir "nadie compró equipo" de "no hay accesorios que comprar".

**Consecuencia.** El principio queda sostenido en los dos lugares donde aplica:
**ausencia de dato no es dato en cero**. Un cero medido —hay accesorios y nadie
los combinó con su equipo— sigue disparando la oportunidad, que es real. Hay
prueba de los dos casos.
