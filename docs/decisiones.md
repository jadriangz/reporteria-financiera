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

*Corrección posterior (2026-09-14).* Las fórmulas estiradas hasta la fila 301 no
están en la plantilla descargable: desde v1.0.0 esa plantilla solo trae fórmula en
la fila de ejemplo, verificado con dos lectores XML. Están en los archivos llenos,
el de demostración (1,200 fórmulas) y el del cliente. La decisión no cambia: el
lector recibe esos archivos y tiene que juzgar su vacuidad sin las columnas
calculadas.

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

---

## 2026-09-12 — `localStorage` se permite, y solo, para preferencias de interfaz

**Contexto.** La regla 1 de `CLAUDE.md` prohíbe `localStorage`, `sessionStorage`
e `IndexedDB` sin excepciones. El tema claro/oscuro no sirve de nada si se
olvida en cada recarga, y lo mismo pasará con el idioma y la disposición.

**Decisión.** Se relaja la regla **exclusivamente para preferencias de
interfaz** —tema, y más adelante idioma y disposición—. **Nunca para datos
financieros, datasets, parámetros de cálculo ni nada derivado de un archivo
cargado.** La excepción vive encapsulada en `src/lib/preferencias/`, con una
lista blanca de claves: `guardarPreferencia` solo acepta claves de esa lista y
valores de esa clave, así que guardar cualquier otra cosa **no compila**.

**Alternativa descartada.** Confiar en la disciplina y una nota en la
documentación. Se descartó porque una excepción que solo existe en prosa se
ensancha sola: en seis meses alguien guarda "el último archivo cargado" para
ahorrarle un clic al usuario y la promesa de que nada sale del navegador deja de
ser cierta sin que nadie lo note.

**Consecuencia.** Ampliar la excepción obliga a editar un archivo que empieza
explicando por qué existe. Además, una prueba recorre `src/`, ignora los
comentarios y exige que ningún otro archivo mencione `localStorage`: quien
intente saltarse el módulo pone la suite en rojo antes de llegar a producción.
Lo que se guarda es un valor de tres opciones; nada que identifique a nadie.

---

## 2026-09-12 — En poco ancho, las tablas de resumen se vuelven tarjetas y las de detalle se desplazan

**Contexto.** En un teléfono ninguna tabla del reporte cabe a lo ancho. La
respuesta habitual —apilar cada fila en una tarjeta— se aplica a todas por
igual.

**Decisión.** Dos estrategias, y **el módulo elige**, no se deduce del número de
columnas (`EstrategiaEstrecha` en `tabla.ts`):

- **Tablas de resumen** —pocas columnas, un renglón por concepto: la cascada del
  estado de resultados y los escenarios de provisión— se vuelven tarjetas
  etiqueta/valor.
- **Tablas de detalle** —muchas columnas, un renglón por operación: saldos
  pendientes, concentración de clientes, rendimiento por modelo, desglose
  mensual— conservan la tabla, se desplazan a lo ancho y **fijan la primera
  columna**, con un degradado en el borde **y** una nota que dice cuántas
  columnas hay y hacia dónde deslizar.

**Alternativa descartada.** Apilar todas las tablas en tarjetas. Se descartó
porque **destruye la comparación de cifras, que es el contenido**: un estado de
resultados se lee concepto por concepto y no pierde nada apilado, pero una lista
de veinticuatro operaciones se lee recorriendo la columna de saldos hacia abajo
para ver cuál es el grande. En tarjetas esa columna deja de existir y el lector
tiene que recordar veinticuatro números en vez de compararlos de un vistazo.

**Consecuencia.** El corte lo decide una **consulta de contenedor**, no el ancho
de la ventana: la misma tabla puede estar en una columna de 480 px dentro de una
pantalla de 1440, y lo que importa es el espacio que tiene. La columna fija usa
una variante opaca del tono de fila (`TONO_FILA_OPACO`), porque por detrás de esa
celda pasa el resto de la tabla y un fondo translúcido dejaría ver las cifras de
otras columnas corriendo bajo el nombre del cliente.

---

## 2026-09-12 — El objetivo táctil crece con el dedo, no con la pantalla

**Contexto.** Los objetivos táctiles deben medir 44×44 px. Los renglones de las
tablas miden 26 px, y la densidad alta es un principio del producto: quien lee
esto compara cifras y necesita verlas juntas.

**Decisión.** Se separan dos casos. En la **barra superior y la navegación** los
controles miden 44 px de verdad, siempre: es una barra de herramientas y ahí el
espacio vertical sobra. En los **controles dentro de una tabla** —encabezados
ordenables, flechas de desplegar— el tamaño depende de `pointer: coarse`: con
ratón siguen midiendo 26 px, con dedo crecen a 44 y el renglón con ellos.

**Alternativa descartada.** Ampliar el área táctil con un pseudo-elemento de
44 px sin agrandar el control. Se probó y se descartó por geometría: con
renglones de 26 px, las áreas de dos filas contiguas se solapan 18 px, y un
toque cerca del borde abre **la fila equivocada**. Un objetivo grande que acierta
al vecino es peor que uno pequeño. El pseudo-elemento (`.toque`) se conserva solo
para controles aislados, donde no tiene vecinos que pisar.

**Consecuencia.** `pointer: coarse` pregunta por el aparato, no por el ancho:
una ventana angosta en un escritorio conserva la densidad, y una tableta ancha
recibe objetivos grandes. La columna crece junto con el control
(`th:has(.toque-denso)`), porque si solo crece el botón, sobresale del encabezado
y el vecino —que se pinta después— se lleva el toque del borde.

---

## 2026-09-12 — La gráfica de categorías recorta por ancho de barra y declara lo omitido

**Contexto.** `rotuloEje` resolvió que las ETIQUETAS quepan: rota y abrevia
hasta que entran. Las BARRAS no se pueden rotar ni abreviar. Con doce modelos y
dos series en 296 px cada barra medía diez píxeles: los rótulos se leían
perfectamente y la gráfica no decía nada, porque comparar dos franjas de diez
píxeles no es comparar.

**Decisión.** La gráfica se queda con las categorías que caben legibles y
escribe al pie cuántas quedaron fuera **y qué proporción del ingreso
representan**: «Se muestran los 4 modelos de mayor ingreso. Quedan fuera 8
modelos más, 4% del ingreso, en la tabla de arriba.» El criterio es el **ancho
disponible por barra** —13 px, medido, no supuesto—, nunca un número fijo de
categorías ni un umbral de pantalla: la misma gráfica puede estar en media
pantalla de escritorio o en un teléfono. El selector entrega **todos** los
modelos ordenados por ingreso; cuántos caben lo decide la gráfica midiéndose.

**Alternativa descartada: una barra «Otros».** Se descartó por tres razones.
(1) **No es comparable con las demás**: cada barra es un modelo, «Otros» sería
la suma de varios, y su altura no diría «este modelo vende más» sino «hay muchos
de estos» —dos afirmaciones distintas leídas en el mismo eje—. (2) **Suele ser
la barra más alta y aplasta al resto**, justo lo contrario de lo que se buscaba
al recortar. (3) **No tiene nombre**: el eje es de categorías y cada marca
identifica un producto. La nota, en cambio, no distorsiona nada y contesta la
única pregunta que importa: si lo que no se ve pesa o no.

**Consecuencia.** La proporción es la del **ingreso**, no la del número de
modelos: ocho modelos omitidos que valen el 4% se pueden ignorar; dos que valen
el 40% no. Cuando el total es cero la proporción se calla en vez de decir «0%»,
que sería afirmar que lo omitido no pesa. **La impresión nunca recorta**: el
papel es de ancho fijo y conocido, y el reporte impreso no debe depender del
ancho que tuviera la ventana al imprimir. El eje de TIEMPO tampoco se recorta
nunca —quitar meses rompería la serie—; ahí se bajan las marcas, que es otra
cosa.

**Defecto que encontró la medición.** La primera versión del cálculo suponía un
hueco por categoría y predecía barras de 14 px donde el navegador dibujaba 10:
`barCategoryGap` se aplica a **cada lado** del grupo. El modelo ahora descuenta
los dos huecos y los márgenes del área de dibujo, y sus predicciones coinciden
con lo medido en el navegador.

---

## 2026-09-12 — La línea base del PDF es un manifiesto, no el PDF

**Contexto.** `CLAUDE.md` y `README.md` citaban un «PDF de referencia (11
páginas)» como definición de la estructura y el orden de secciones del reporte.
Ese archivo no está en el repositorio ni lo estuvo nunca: cero resultados en
disco y cero en el historial de Git. Era una referencia muerta, y `/verificar`
necesitaba algo real contra lo que comparar el PDF que genera.

**Decisión.** La línea base vive en `docs/linea-base-pdf.md`: orden y títulos de
sección, orientación de cada página, invariantes del papel, las cifras que deben
leerse en él, y las casillas que la primera corrida rellena. Las dos referencias
muertas ahora apuntan ahí.

**Alternativa descartada.** Commitear un PDF de referencia y comparar página por
página. Un binario no se revisa en un diff: nadie ve en un pull request qué
cambió, así que el archivo envejece sin que nadie lo note —que es exactamente lo
que le pasó al de 11 páginas—. Además obligaría a regenerarlo entero por mover
un corte de página.

**Consecuencia.** La comparación es de estructura e invariantes, no de píxeles, y
eso es lo que había que vigilar: que el orden del reporte no se mueva, que el
Estado de resultados siga apaisado, que la página «Módulos no incluidos» no
aparezca con el archivo de demostración —que habilita los seis módulos—, y que el
papel salga en claro aunque la pantalla esté en oscuro. Actualizar la línea base
exige editar texto y registrar la decisión, no sobrescribir un binario en
silencio.

---

## 2026-09-12 — El recorrido de verificación carga el fixture con un parámetro de desarrollo

**Contexto.** `/verificar` recorre seis módulos en cuatro anchos y dos temas:
cuarenta y ocho estados. Arrastrar el archivo de demostración a mano en cada
arranque, y además fijar la fecha de corte en `2026-09-09` para que el aging
coincida con las cifras de referencia, convertía el recorrido en algo que nadie
iba a completar dos veces.

**Decisión.** `?fixture=demo`, exclusivo de desarrollo. `src/main.tsx` importa el
módulo dentro de `if (import.meta.env.DEV)`: en `build`, Vite sustituye esa
expresión por `false`, Rollup elimina la rama y el chunk dinámico nunca se emite,
así que en producción el módulo no queda inerte, queda **ausente**. La ruta del
archivo es un import estático `?url` y nunca sale de la query; lo que viaja en la
URL es una bandera que se compara contra un literal.

**Alternativa descartada.** Un parámetro que reciba la ruta del archivo
(`?archivo=…`). Habría servido también para el archivo real del cliente, y ahí
está el problema: un cargador de rutas arbitrarias en una aplicación cuyo
argumento de venta es que los datos no salen del navegador. La comodidad no vale
ese riesgo, y el fixture es el único archivo que el recorrido necesita.

**Consecuencia.** La cerca es doble y automática. Una prueba guardián recorre
`src/` —al estilo de la que protege `src/lib/preferencias`— y exige que el módulo
entre solo por `main.tsx` bajo la guarda, y que dentro del módulo la ruta venga
solo del import estático. Y trece casos de ejecución comprueban que ninguna query
—incluida `?fixture=demo&archivo=/etc/passwd`— pida algo distinto del fixture.
Como evidencia de que la rama no llega al cliente: el bundle de producción quedó
con los mismos hashes que antes del cambio, byte a byte idéntico.

---

## 2026-09-13 — La plantilla se edita a mano: no hay generador

**Contexto.** La plantilla y `ENCABEZADOS` son dos copias del contrato,
sincronizadas por una prueba. Se propuso un generador que produjera el .xlsx
reutilizando la exportación a Excel con un dataset vacío, para que la divergencia
fuera imposible por construcción. Un prototipo midió lo que se perdía: la versión
gratuita de SheetJS no escribe estilos de celda, listas desplegables ni paneles
fijos. La plantilla tiene unas 1,460 celdas con estilo, 7 reglas de validación y
el encabezado fijo en cuatro hojas. Además, su hoja INSTRUCCIONES le dice al
cliente «solo escriba en las celdas de letra azul» y que la fila de fondo verde es
el ejemplo.

**Decisión.** No se escribe el generador. La plantilla se edita a mano sobre su
XML, conservando estilos, listas y paneles (GOBERNANZA.md §7, paso 2). La
herramienta de generación se decide con el rediseño de la plantilla v2 (§11).

**Alternativa descartada.** El generador con SheetJS más un inyector de XML que
agregue estilos, listas y paneles. No quita piezas: cambia sincronizar
`ENCABEZADOS` con un .xlsx por sincronizar `ENCABEZADOS`, una tabla de estilos y
un inyector, con el mismo riesgo de deriva.

**Consecuencia.** La sincronización sigue dependiendo de la prueba de encabezados
(`src/lib/parse/__tests__/plantilla.test.ts`), no de una sola fuente, y
`/terminado` reporta el paso 2 como pendiente humana. Para que una edición a mano
no vuelva a romper el archivo sin que nadie lo note, la misma prueba exige ahora
que cada parte XML esté bien formada. La plantilla versionada tenía 1,297 filas sin
cerrar en ventas, cobranza y gastos: SheetJS las leía sin quejarse, y probablemente
Excel pedía reparar el archivo al abrirlo. Editar el XML a mano, además, acumula basura
invisible: las cadenas de `sharedStrings.xml` que quedaron huérfanas al quitar la lista
de modelos y al sustituir textos de la plantilla lo prueban. Es una razón más para que
la plantilla v2 no se haga a mano.

---

## 2026-09-13 — Modelo es texto libre: la plantilla no trae lista de modelos

**Contexto.** `_listas` traía una columna de modelos (T100, T70P, T55, T25P y
accesorios) con su lista desplegable en `ventas.modelo`. Son los productos del
cliente de drones, y la plantilla debe ser agnóstica al giro (CLAUDE.md,
«Contexto»).

**Decisión.** Se quitan la lista de modelos y su validación: modelo es texto libre.
Las seis listas que quedan son las enumeraciones de `schema.ts`, y una prueba
exige que coincidan y que cada lista desplegable apunte a la suya.

**Alternativa descartada.** Conservar la lista como ejemplo editable. Cualquier
otro giro la encontraría llena de drones, y la lista desplegable de Excel le
sugeriría productos que no vende.

**Consecuencia.** La plantilla ya no previene los errores de dedo en modelo
(`T70p` / `T70P`). Los absorbe la normalización a mayúsculas antes de agrupar, que
ya existía (CLAUDE.md, «Trampas de parseo»).

---

## 2026-09-13 — `linea` se canoniza en el esquema, no en el motor

**Contexto.** Una venta con `linea` escrita «demo» o «DEMO» se contaba como venta,
mientras el panel de validación afirmaba que se había excluido. La regla del
validador comparaba sin distinguir mayúsculas; el motor comparaba exacto contra
`"Demo"` (`base.ts`, `insights.ts`) y nada normalizaba el campo antes. El tipo
`Dataset` ya declaraba `linea` como enumeración, pero `VentaSchema` solo hacía un
*cast*: el tipo afirmaba algo que nadie comprobaba.

**Decisión.** `VentaSchema` canoniza `linea` contra `LINEA` con `canonizar()`, que
compara con `norm()`. La regla `filas-demo` del validador usa la misma función, de
modo que el panel y el motor no pueden volver a juzgar distinto la misma celda.

**Alternativa descartada.** Normalizar en el motor, comparando `norm(linea)` en
`base.ts` y en `insights.ts`. Son dos puntos de comparación, y cada consumidor
futuro tendría que acordarse. El `Dataset` seguiría diciendo «demo» en la interfaz,
en la exportación a Excel y en el tipo. Y contradice AD-06: el motor recibe el
esquema canónico, no lo reconstruye.

**Consecuencia.** La frontera de `CLAUDE.md` queda intacta: el parser canoniza la
grafía y conserva la fila; excluirla sigue siendo trabajo exclusivo del motor. Una
fuente futura (Odoo) tiene que pasar por el esquema para heredar la corrección. Un
valor que no es de la lista («Accesorio») se conserva tal como vino, así que el tipo
todavía miente para esos valores: queda pendiente decidir si son error o advertencia.

---

## 2026-09-13 — Arreglar el código para que cumpla la especificación es PARCHE, aunque mueva cifras

**Contexto.** El arreglo anterior mueve las cifras de cualquier cliente que haya
escrito «demo»: su costo y su utilidad bruta dejan de incluir una unidad que no
vendió. La regla crítica de GOBERNANZA.md §3 dice MAYOR cuando un cambio altera un
número ya reportado, y leída sola lo clasificaría así.

**Decisión.** PARCHE (1.1.1). §3 pide MAYOR cuando cambia una definición de cálculo.
Aquí la definición no cambió: `CLAUDE.md` siempre dijo que las filas Demo se
excluyen de todo cálculo de venta, y el código por fin lo hace. Se agregó la
distinción a §3, con este caso como ejemplo.

**Alternativa descartada.** MAYOR (2.0.0) por el solo hecho de mover cifras.
Equipararía el arreglo de un defecto con un cambio de criterio y vaciaría de
significado el número mayor, que existe para avisar que decidimos calcular distinto.

**Consecuencia.** Lo que protege la regla crítica es el criterio, no la cifra. El
arreglo se anuncia igual, porque un número que el cliente vio cambia, pero no se
presenta como incompatible.

---

## 2026-09-13 — Un valor de lista no reconocido recibe lo de la celda vacía, y se avisa

**Contexto.** `comision_base` «utilidad» cobraba la comisión sobre el precio, y «no
aplica» la cobraba en vez de anularla: el motor compara exacto y nadie canonizaba
el campo. En parámetros, un `comision_base_default` «utilidad» se descartaba sin
aviso y quedaba «Venta». Y quedaba abierto lo que registra la entrada sobre `linea`:
un valor fuera de la lista («Accesorio») llegaba al motor tal cual, con un tipo que
prometía la enumeración.

**Decisión.** `ENUMERACIONES` (`schema.ts`) declara las seis columnas de lista con
lo que recibe su celda vacía. El esquema canoniza mayúsculas, espacios y acentos. Un
valor que aun así no es de la lista recibe lo mismo que la celda vacía, y la regla
`enumeracion-no-reconocida` lo avisa como **advertencia**, con hoja, fila, lo
capturado, lo aplicado y las opciones válidas. `comision_base_default` sigue el
mismo criterio con la regla `parametro-no-reconocido`: se aplica «Venta» y se dice.

**Alternativa descartada.** Rechazar la fila con error. Un error saca la fila del
Dataset. Por escribir «Accesorio» desaparecería una venta entera de la venta total,
del costo y de la cartera, y un gasto con «Nomina» mal escrito saldría del estado de
resultados. Castiga un error de clasificación borrando importes que sí se leyeron,
y rompería archivos que hoy cargan bien (GOBERNANZA.md §7). El nivel error de
CLAUDE.md es para lo que impide calcular: importe ilegible, fecha inválida, llaves
rotas. Una clasificación no reconocida no lo impide si se declara qué se aplicó.
Para el parámetro tampoco sirve el error. El panel no bloquea módulos por un
parámetro, así que un error que igual calcula con «Venta» mentiría sobre lo que
pasó. Bloquear de verdad los módulos que usan la comisión apagaría medio reporte
por una celda.

**Consecuencia.** Nunca llega al motor un valor fuera de la lista, y nunca se
sustituye uno sin aviso. `comision_base`, `condicion`, `metodo`, `categoria` y
`tipo` conservan el tipo `string | null`: el esquema ya garantiza el valor, y
estrechar el tipo tocaría selectores y pruebas de la interfaz, fuera de este
parche. Es la versión 1.1.2, PARCHE por la distinción de §3: la fórmula de comisión
de CLAUDE.md no cambió. El mismo patrón de valor por omisión silencioso sigue en
otros parámetros numéricos y de fecha, y queda sin arreglar aquí.

---

## 2026-09-14 — La hoja `parametros` se valida como capa, con la severidad de las listas

**Contexto.** La hoja `parametros` nunca recibió el tratamiento de las hojas de
datos. Un valor que no se podía leer caía a su valor por omisión sin ningún
hallazgo: `provision_91_180` «30%» aplicaba 25%, `tasa_iva` «16» se leía como
1600%, `periodo_inicio` «2026-01-01» se perdía e `importes_incluyen_iva` «Sí
incluye» quedaba sin contestar. Y los parámetros son lo único que el usuario
configura a mano para ajustar el reporte a su criterio.

**Decisión.** `src/lib/parse/parametros.ts` declara, para cada parámetro del
contrato, cómo se lee y qué formatos acepta. `validate()` lee con esa declaración,
y la regla `parametro-no-reconocido` avisa, con la misma declaración, de todo
valor capturado que no se pudo leer: qué se capturó, qué se aplicó y qué formatos
se aceptan. Tres reglas más cierran lo que el lector descartaba antes de llegar
ahí: `parametro-desconocido` (un nombre que no es del contrato),
`parametro-repetido` (gana la última fila) y `valor-sin-parametro`. Las lecturas
se amplían a lo que escribe una persona:

- Porcentajes con `parsePct`, la misma regla de `comision_pct`: «30%», «30», «0.30»
  y «0,30» son 30%. El caso ambiguo se resuelve así: un número mayor que 1 se lee
  como por ciento, nunca como 3000%, y «1» solo es 100%. La regla está escrita en
  INSTRUCCIONES y en las notas de la plantilla. Fuera de 0–100% no se lee.
- Fechas con `parseFecha`, entre 1990 y 2100: un serial de Excel fuera de ese
  rango es un número que cayó en la celda equivocada.
- Booleanos con `parseBool` (SI, NO, Sí, sí, true, 1…).
- `moneda_base` contra `MONEDA_BASE`, que en v1 solo tiene MXN.
- Días como entero no negativo; tipo de cambio mayor que cero.

**Severidad: advertencia, la misma que un valor de lista.** Un parámetro mal leído
sí mueve cifras, y una `linea` mal escrita solo reclasifica. Pero en este proyecto
la severidad no mide importancia: mide qué se deja de calcular. «Error» significa
que bloquea el módulo afectado, y el panel lo dice textualmente («N errores
bloquean los módulos afectados»). Un parámetro que no se pudo leer no bloquea
nada: el reporte se calcula con el valor por omisión, y el aviso lo dice.

**Alternativa descartada.** Error para los parámetros que mueven cifras. Sin
bloquear, el panel mentiría: diría que el módulo está bloqueado mientras muestra
la provisión. Bloquear de verdad apagaría la cartera entera —aging, DSO,
detalle— por una tasa que solo afecta a la provisión. La diferencia de impacto se
atiende donde importa: haciendo visible la sustitución junto a la cifra que
afecta, que queda por acordar. Subir la severidad no la atiende.

**Consecuencia.** Ningún valor capturado en `parametros` se descarta sin un
hallazgo. El demo y la plantilla tienen los parámetros bien escritos y no producen
ninguno, así que las cifras de referencia no se mueven. Es la versión 1.1.3,
PARCHE por la distinción de §3: el contrato siempre prometió leer lo que el
usuario configura. Queda sin cerca la fila de encabezados: si el cliente la borra,
la primera fila de datos se toma por encabezado y su valor se pierde.

---

## 2026-09-14 — Cierre de la serie del contrato: las sustituciones llegan al papel y toda coerción vive en el esquema

**Contexto.** La 1.1.3 hizo que el panel avisara de todo parámetro que no se pudo
leer, pero el panel no viaja con el PDF. Un socio podía recibir un reporte
calculado al 25% cuando el dueño había capturado un 30% ilegible, sin nada en el
papel que lo dijera. Y en las hojas de datos seguía el patrón de la serie:
- `dias_credito` se coercionaba con `Number()`: «30dias» entraba al dataset como NaN, y
  «-5» o «30.5» se usaban tal cual en el aging. Corrección posterior: esta entrada decía que
  el NaN llegaba al aging, y no es así. `diasDeVenta` ya descartaba lo no finito y medía esa
  venta por antigüedad.
- `comision_pct` aceptaba 150%.
- Un importe con otra gramática se leía en silencio: «1,234.56» como $1.23 y
  «1234.56» como $123,456.
- Un serial de fecha sin rango daba 1900 o 2173, y con la hora incluida.

**Decisión.**
- `validate()` entrega las sustituciones de parámetros como datos
  (`{clave, capturado, aplicado, fila}`). El store las guarda con el dataset y la
  interfaz las pinta junto a la cifra que afectan: provisiones, periodo y DSO,
  tarjeta de IVA y comisión. También las pinta en el bloque Alcance de la portada
  del PDF. Lo hace la interfaz, no el motor, que recibe el esquema canónico y no
  razona sobre la procedencia de sus entradas (AD-06).
- Cuando el usuario ajusta un parámetro desde la interfaz, su aviso desaparece: el
  valor ya es decisión suya. Volver a validar no lo revive; cargar otro archivo
  empieza de cero.
- En las hojas de datos, las coerciones del esquema validan el dominio: importes
  solo con la gramática europea del contrato, porcentajes entre 0 y 100%, días como
  entero no negativo y fechas entre 1990 y 2100, sin hora.
- La severidad sigue a la consecuencia, con el criterio de la 1.1.3. Un importe o
  una fecha que no se pueden leer siguen siendo **error**: sin importe la operación
  no se suma, y sin fecha no se ubica. Un porcentaje o unos días de crédito
  ilegibles son **advertencia**, porque la venta se calcula como con la celda vacía.
  `comision_pct` ilegible era error y pasa a advertencia: el panel afirmaba un
  bloqueo mientras la venta se calculaba igual.

**Alternativas descartadas.**
- **Adivinar la gramática de un importe.** «1,234.56» tiene coma de miles y punto
  decimal, y adivinarlo resuelve ese caso; «1.500» no: en el contrato es mil
  quinientos, y para quien escribe con punto decimal es uno y medio. Adivinar a
  veces es peor que no adivinar nunca. El contrato dice formato europeo, y lo que no
  lo cumple se rechaza con un hallazgo.
- **Pasar las sustituciones al motor** en `OpcionesInsights` para que él redactara
  la tarjeta de IVA. Pondría al motor a razonar sobre la calidad de sus propios
  datos.

**Consecuencia.** Los cuatro defectos de la serie 1.1.1–1.1.4 eran el mismo error de
diseño. Queda escrito como restricción aprendida en CLAUDE.md: toda coerción y toda
canonización del contrato viven en el esquema, y ningún consumidor interpreta
valores crudos. El demo tiene sus importes, fechas, porcentajes y días como números
válidos, así que las cifras de referencia no se mueven. Es la versión 1.1.4, PARCHE.
Quedan en el backlog (GOBERNANZA.md §11) las columnas fuera del contrato, la hoja
`parametros` sin encabezados y la coherencia entre parámetros.

---

## 2026-09-14 — Al guardar el PDF se recomienda desactivar los encabezados y pies del navegador

**Contexto.** La primera corrida de `/verificar todo` guardó el reporte con la casilla
«Encabezados y pies de página» de Chrome activada. En el margen de cada hoja salieron la fecha y
hora de impresión («9/14/26, 2:05 AM»), el título, la dirección de la aplicación
(`localhost:5174/?fixture=demo`) y el número de hoja («4/15»). La aplicación todavía no imprime
sus propios números de hoja (GOBERNANZA.md §11).

**Decisión.** Se recomienda desactivarla. La recomendación está en `docs/linea-base-pdf.md`
(«Opciones del diálogo de impresión») y en la ayuda junto al botón «Descargar PDF», y la corrida
canónica de la línea base se guarda así.

**Alternativa descartada.** Recomendar activarla, porque hoy es lo único que numera las hojas. La
dirección de la aplicación en el encabezado del reporte de un cliente es peor que perder el número
de hoja, que ya está en el backlog. Además, la fecha de impresión en el formato del navegador
compite con la fecha de corte.

**Consecuencia.** El reporte impreso no lleva número de hoja hasta que la aplicación lo imprima.
Que desactivar la casilla no mueva los saltos de página no está verificado: la corrida que fijó la
paginación se guardó con la casilla activada.

---

## 2026-09-14 — «Sale en claro» se juzga sobre la hoja completa, y mirando el papel

**Contexto.** Desde v1.1 el invariante «la impresión siempre sale en claro» se daba por
verificado. Se había comprobado leyendo `data-tema` y los tokens del contenido, no mirando una hoja
impresa. La primera corrida de `/verificar` que abrió el PDF encontró las 15 hojas pintadas de
`#121212`, con un rectángulo blanco solo en el área de contenido: el contenido salía claro y la
hoja no.

**Decisión.** La línea base agrega el invariante «la hoja completa sale en claro, márgenes
incluidos», y deja escrito cómo se verificaba el anterior.

**Alternativa descartada.** Seguir juzgando el invariante sobre el contenido, que es lo que el
código controla directamente. El margen también es papel: es lo primero que ve quien recibe el
reporte, y lo que se imprime en cada hoja.

**Consecuencia.** Un invariante que solo se verifica por código puede estar incumplido sin que
nadie lo note. El defecto queda abierto, candidato a 1.1.5, y sin diagnosticar: no se sabe si pasa
también imprimiendo con el tema claro.

---

## 2026-09-14 — La plantilla de Google Sheets se lee solo con el usuario presente, sin servidor

**Contexto.** La fase v1.3 (ROADMAP.md §3) lleva la plantilla a Google Sheets: el cliente la
clona, la llena en línea y la aplicación la lee después de iniciar sesión con Google. Al plantear
la fase se supuso el flujo de código de autorización, que intercambia el código en un servidor, y
se concluyó que rompía «nada sale del navegador». Se verificó en la documentación de Google
Identity Services que no hace falta. El modelo de tokens entrega el token de acceso directamente
al navegador, sin servidor ni secreto de cliente, y no emite tokens de actualización. El servidor
solo hace falta para leer sin el usuario presente.

**Decisión.** En v1.3 la aplicación lee la hoja **solo con el usuario presente**, con el modelo de
tokens y sin servidor. Tres razones:

1. **Conserva «nada sale del navegador»**, que es la promesa que se le hace al cliente y lo que
   diferencia al producto.
2. **Evita custodiar tokens de acceso al Drive de terceros**, una responsabilidad que no conviene
   adquirir por adelantado.
3. **El acceso sin el usuario presente solo hace falta para lectura programada.** Eso pertenece
   al envío automático mensual del backlog, que llega con la persistencia de v1.4.

**Alternativa descartada.** El flujo de código de autorización, con servidor y token de
actualización, para leer la hoja sin el usuario o recordarla entre sesiones. Rompería el principio
y adelantaría la custodia de credenciales a una fase que no la necesita.

**Consecuencia.** El token vive solo en memoria. Ni él ni el identificador del archivo se guardan
(regla 1 de `CLAUDE.md`): en cada sesión el usuario inicia sesión y elige la hoja otra vez, y
cuando el token vence lo renueva con un gesto. La v1.3 no carga con la sección de seguridad de la
persistencia, pero sí con el aviso de privacidad y la verificación de la app ante Google, porque
pide acceso a documentos del cliente. Leer sin el usuario presente sería una decisión nueva que
reabre esta entrada.

---

## 2026-09-14 — El tema oscuro solo existe en pantalla

**Contexto.** Desde v1.1.0, el PDF impreso con la pantalla en oscuro salía con la hoja completa
pintada de `#121212`, márgenes incluidos, y un rectángulo blanco solo bajo el contenido. El tema
escribía `color-scheme: dark` en línea en el `<html>`, desde `aplicarTema` y desde el script de
`index.html`. Un estilo en línea le gana a cualquier hoja de estilos, también a la regla de
`@media print` que lo volvía claro, y Chrome pintaba el lienzo de la hoja con su fondo oscuro por
omisión. El invariante se daba por cumplido porque se había verificado leyendo el código, y las
pruebas de entonces exigían justamente el estilo en línea y un texto en `@media print`.
Imprimiendo con el tema claro no pasaba: los márgenes quedaban sin pintar.

**Decisión.** El bloque del tema oscuro, con su `color-scheme: dark` y sus tokens, va dentro de
`@media screen`, y nadie escribe `color-scheme` en línea. En papel no existe ninguna regla oscura,
así que la impresión no tiene que ganarle a nada. El bloque de `@media print` se queda solo para
fijar en la raíz los valores claros exactos en el Ctrl+P directo, sin nombrar el tema oscuro. Las
pruebas fijan la estructura: toda regla oscura y todo `color-scheme: dark` viven en
`@media screen`, y ni `aplicarTema` ni el script escriben el esquema.

**Alternativa descartada.** Que la impresión sobrescribiera el estilo en línea desde el mismo
nivel, con `beforeprint` y `afterprint`. Evita la especificidad, pero deja dos escritores del mismo
valor sincronizados por eventos, más piezas móviles que el problema, y la corrección depende de que
los eventos se disparen en cada navegador y en cada camino de impresión.

**Consecuencia.** Verificado el 2026-09-14 en un PDF impreso a mano desde oscuro: ningún relleno
oscuro de hoja completa, contra 15 en el PDF anterior al arreglo. En pantalla, sin estilo en línea,
el esquema calculado sigue al tema. Un invariante del papel se verifica en el papel.

---

## 2026-09-14 — Los rótulos del eje se deciden con su largo medido

**Contexto.** «Ingreso contra utilidad por modelo» mostraba en pantalla los 12 modelos con los
rótulos encimados a 1024 px y cortados a 768 px, y en papel cortados. Se sospechó que el recorte de
categorías estaba desactivado; no lo estaba: las barras caben y recortar no toca. El defecto estaba
en `rotuloEje`, desde v1.1.0. Decidía solo con los píxeles por categoría (horizontal desde 64,
abreviar por debajo de 34) y reservaba un alto fijo de 48 px para los girados. A 1024 px tocaban 73
px por modelo y quedaban horizontales, pero «Curso piloto certificado» mide 113 px. Girado necesita
66 px en pantalla y 54 en papel. Además, al imprimir `Grafica` no sumaba alto por el eje.

**Decisión.** `rotuloEje` sigue pura y recibe cada rótulo con su ancho medido con
`canvas.measureText` y la tipografía real. Decide en cascada: horizontal si el más ancho, con 8 px
de aire, cabe en su columna; girado a −30° si cabe en un alto máximo de 80 px y el primer rótulo no
se sale a la izquierda del eje Y; abreviado si no. `Grafica` vuelve a medir las etiquetas ya
abreviadas, calcula con ellas el alto del eje y suma el exceso a la gráfica, en pantalla y en papel.
Los 80 px y el margen de 10 px bajo el eje se calibraron midiendo la gráfica pintada: el eje reserva
77 px y el rótulo más bajo llega a 73.9 a 1440, 1024 y 768 px. A 360 px el recorte deja 4 modelos,
con su nota, y sus rótulos quedan horizontales. Canvas y SVG coincidieron hasta 0.02 px.

**Alternativa descartada.** Estimar el ancho contando caracteres. «Curso piloto certificado» mide
0.43 veces el tamaño de letra por carácter, y una estimación de 0.6 se equivoca un 40%, justo el
margen que produce el defecto. Descartado también subir el alto máximo cada vez que un rótulo no
quepa: un eje que crece sin límite se come la gráfica, y ahí la respuesta es abreviar.

**Consecuencia.** Las pruebas de `rotuloEje` se reescribieron: las anteriores fijaban la regla por
píxeles y el alto de 48 px, es decir, el defecto. La gráfica de modelos crece unos píxeles, también
en el PDF. Con el demo eso no movió ningún salto de página, verificado en el papel el 2026-09-14;
con otros datos podría moverlos. En ese PDF, los 12 rótulos salen girados, completos y dentro del
recorte de la gráfica. Una prueba nueva, que lee el JSX con el analizador de
TypeScript, fija que Producto le pasa el recorte a su gráfica.

---

## 2026-09-14 — Márgenes laterales del PDF en píxeles enteros

**Contexto.** Desde v1.0.0, en el PDF, los marcos de sección y la cuarta tarjeta de indicadores se
veían abiertos a la derecha. Medido en el PDF: con 12 mm por lado sobre los 816 px CSS de la hoja
carta, el área impresa medía 725.3 px (965.3 en apaisado), pero Chrome maquetaba la página a 726 px
(965.5), y los bordes derechos quedaban hasta 0.69 px fuera.

**Decisión.** Márgenes laterales de 45 px en `@page`, 0.09 mm menos por lado que antes. El ancho
imprimible queda en 726 px en vertical y 966 en apaisado: enteros, sin redondeo que perder. Arriba y
abajo se quedan en milímetros porque no tocan ningún borde lateral.

**Alternativa descartada.** Una sangría de 1 px en la vista imprimible. Aparta los bordes del filo,
pero deja el contenido más ancho que el área impresa, así que los fondos a ancho completo seguirían
perdiendo 0.7 px. Es un número mágico que compensa un redondeo que no controlamos, en vez de quitar
el desajuste.

**Consecuencia.** Verificado el 2026-09-14 en los dos PDF de la corrida de la 1.1.5: el área
impresa termina en 578.25 pt (758.25 apaisada) y ningún borde gris la pasa. La paginación no se
movió: 15 hojas con el mismo reparto por módulo.

---

## 2026-09-14 — Serie de partidas (v1.2.0): cómo leer las entradas que siguen

Las once entradas siguientes se **tomaron** el 2026-09-14 y se **escribieron** el 2026-10-10. Entre
una fecha y otra vivieron en un archivo de memoria fuera del repositorio, que se perdió con un
formateo; se reconstruyeron de lo que la persona recordaba. La lección está en la última entrada de
este archivo y en GOBERNANZA.md §9.

Contexto común a todas: el cliente capturó varias filas con el mismo folio sin que nadie se lo
pidiera, porque una venta real incluye un equipo y sus accesorios. **El modelo estaba mal, no su
captura.** Describen la versión 1.2.0, que al escribirlas no está implementada: producción sigue en
1.1.5. La especificación está en CLAUDE.md, «Partidas por folio (v1.2.0)».

Donde una entrada dice «Alternativa descartada: no quedó registrada», es literal: la reconstrucción
no la trajo, y no se inventa una para llenar el formato.

---

## 2026-09-14 — El folio agrupa partidas dentro de `ventas`, sin hoja nueva

**Contexto.** `folio` era el identificador único de una fila de `ventas`, y eso confundía la
operación comercial con las partidas que la componen. La regla `folio-duplicado` lo trataba como
error: «la cobranza no sabría a cuál aplicar».

**Decisión.** El folio pasa a **agrupar** filas dentro de `ventas`: cada fila es una partida, y
las filas con el mismo folio son una sola operación. **No se agregan campos al contrato**: las
columnas son las mismas y solo cambia su significado. `folio-duplicado` deja de ser error, porque
repetir el folio es ahora la forma correcta de capturar una venta con varios productos. Lo que
queda de esa regla es la validación de cabecera inconsistente (entrada siguiente).

**Alternativa descartada.** Una hoja `partidas` separada. Duplicaría el trabajo de captura y
obligaría al cliente a cambiar cómo ya trabaja.

**Consecuencia.** La llave `ventas.folio` ←→ `cobranza.folio_venta` no cambia: un abono sigue
apuntando a un folio, y ya no hay ambigüedad porque se aplica al folio entero (ver «Los pagos se
aplican en orden de entrega»). `dataset.ventas` sigue siendo una lista de filas; lo que cambia es
que varias pueden compartir folio.

---

## 2026-09-14 — Cabecera por folio y datos por partida; la cabecera se resuelve al leer

**Contexto.** Si varias filas son una operación, algunas columnas describen la operación y otras
el producto. Hay que decir cuáles, y qué pasa cuando las filas de un folio no coinciden.

**Decisión.**
- **Cabecera**, igual en todas las partidas del folio: `cliente`, `dias_credito`, `condicion`,
  `vendedor`.
- **Partida**, varía por fila: `linea`, `modelo`, `serie`, `costo_unitario`, `precio_venta`,
  `comision_pct`, `comision_base`, `fecha`.
- `cliente` distinto entre partidas del mismo folio es **error** y saca **el folio completo** del
  dataset, con un mensaje que lista sus filas.
- `dias_credito`, `condicion` o `vendedor` distintos es **advertencia**: se toma el de la primera
  partida y se dice cuál se aplicó.
- La cabecera puede venir **solo en la primera fila** del grupo: las demás heredan, **sin
  advertencia**. Es una forma válida de capturar.
- **La herencia y la resolución de cabecera viven en la capa de parseo** —esquema y validación—,
  no en el motor. El motor recibe cada partida con su cabecera ya resuelta. Confirmado el
  2026-10-10: la reconstrucción decía «el motor acepta», y eso habría sido el quinto caso de la
  restricción «toda coerción vive en el esquema» de CLAUDE.md.

**Alternativa descartada.** Resolver la cabecera en el motor. Lo pondría a interpretar una celda
vacía como «heredar», que es leer valores crudos. Además no alcanza: hoy `VentaSchema` exige
`cliente`, así que una fila que lo deja vacío se excluye antes de llegar al motor. Ejecutado el
2026-10-10 con datos inventados: «La fila no cumple el formato esperado y fue excluida».

**Consecuencia.** La resolución necesita ver el grupo, y el esquema de hoy juzga fila por fila:
la sesión de implementación decide cómo se ordenan las dos cosas dentro de `src/lib/parse/`.
Quedan sin decidir, y se registran como huecos: qué se aplica si la primera fila trae vacío un
dato de cabecera que una fila posterior sí trae, y qué pasa con los abonos de un folio excluido
por `cliente` en conflicto (hoy un abono sin venta es error de cobranza huérfana).

---

## 2026-09-14 — La fecha de una partida es su fecha de entrega

**Contexto.** `ventas.fecha` no decía de qué era la fecha. Con un folio de varias filas la
pregunta deja de ser retórica: ¿una fecha por operación o una por partida?

**Decisión.** Es la **fecha de entrega**, confirmado con el cliente. Cada partida tiene la suya y
son legítimamente distintas: puede entregar el equipo un día y los accesorios otro. Por eso
`fecha` es dato de partida y no de cabecera.

**Alternativa descartada.** No quedó registrada.

**Consecuencia.** Los ingresos por mes se agrupan por la fecha de cada partida, y un folio puede
abarcar dos meses. `dias_credito` cuenta desde la entrega de cada partida. Las definiciones de
CLAUDE.md que hoy dicen `fecha_venta` pasan a leerse como la fecha de entrega de la partida.

---

## 2026-09-14 — Los pagos se aplican a las partidas en orden de entrega

**Contexto.** Un abono apunta a un folio, no a una partida. Para envejecer la cartera hay que
decidir qué partidas quedan pagadas y cuáles pendientes.

**Decisión.** Los pagos del folio se aplican a sus partidas **en orden de entrega, la más antigua
primero**. Lo que queda sin pagar es lo último entregado, y la cartera envejece desde ahí. Es lo
que hace cualquier ERP. Casos límite, todos decididos:

- **Sobrecobro con varias entregas:** el exceso queda como saldo negativo en la última partida
  entregada, en su tramo.
- **Partida sin fecha dentro de un folio:** se ordena al final; lo pendiente en ella va al tramo
  «sin fecha».
- **Partida Demo en un folio con ventas:** se excluye como hoy, y los pagos del folio se aplican
  solo a las partidas que cuentan, con advertencia.
- **Dos partidas con la misma fecha:** decide el orden de las filas.

**Alternativa descartada.** No quedó registrada.

**Consecuencia.** El saldo de un folio puede caer en **dos tramos** de antigüedad si lo pendiente
abarca partidas de fechas distintas. Es correcto y más preciso. Los invariantes se mantienen:
`Σ buckets === saldoTotal` y `cobrado + saldo === venta`. La decisión del 2026-09-11 sobre
sobrecobros sigue en pie; ahora dice además en qué partida cae el negativo.

---

## 2026-09-14 — Un pago anterior a la primera entrega es un anticipo, y es información

**Contexto.** Con fecha de entrega por partida aparece un caso que antes no se distinguía: el
abono que llega antes de que se entregue nada.

**Decisión.** Un pago con fecha anterior a la primera entrega de su folio es un **anticipo** y se
clasifica como **info**, no advertencia: en este negocio es lo normal. Advertencia solo cuando el
hueco entre el pago y la entrega sea implausible. Métrica nueva: **proporción de la cobranza que
son anticipos**, que mide la necesidad de capital de trabajo de un negocio que importa.

**Alternativa descartada.** Advertencia para todo anticipo. Llenaría el panel con lo habitual y
enseñaría a ignorarlo.

**Consecuencia.** **El umbral de «implausible» queda por definir** en la sesión de implementación,
justificado con el negocio y con datos inventados, nunca con cifras del cliente (GOBERNANZA.md
§10). Tampoco está escrito sobre qué base se mide la proporción ni qué se hace con un abono sin
`fecha_pago` o con un folio sin ninguna fecha de entrega: son huecos de esa sesión.

---

## 2026-09-14 — Qué se calcula por folio y qué por partida

**Contexto.** Con dos niveles, cada cifra del reporte tiene que decir a cuál pertenece.

**Decisión.**
- **Por folio:** cobrado, saldo, antigüedad, buckets, provisión, DSO y ticket promedio.
- **Por partida:** utilidad bruta, margen, comisión, rendimiento por modelo y por línea, e
  ingreso por mes.
- **«Operaciones» pasa a significar folios, no filas**, también en la columna de Clientes.
- En Ventas y flujo la cuenta por mes cuenta **entregas**, porque un folio puede abarcar dos
  meses.
- **Interfaz:** Cobranza y Ventas listan folios, expandibles a sus partidas con `FilaExpandible`.
  Producto lista partidas, sin cambio de forma. Clientes y Estado de resultados no cambian de
  forma.

**Alternativa descartada.** No quedó registrada.

**Consecuencia.** `operaciones` y `ticket_promedio` cambian de unidad. En un archivo con una fila
por folio dan lo mismo que antes (ver la entrada de la versión). «Antigüedad por folio» se lee
junto con la entrada anterior: el cobro y el saldo son del folio, y lo pendiente envejece según la
partida donde quedó.

---

## 2026-09-14 — El attach rate por cliente se conserva; la venta cruzada por folio es métrica nueva

**Contexto.** Con partidas se puede medir la venta cruzada dentro de una misma operación: folios
con equipo y accesorio sobre folios con equipo. Lo natural parecía sustituir el attach rate por
cliente.

**Decisión.** El attach rate **por cliente** se conserva sin cambio. La venta cruzada **por
folio** entra como métrica nueva, y **solo se juzga si hay al menos un folio con varias
partidas**.

**Alternativa descartada.** Sustituir el attach rate por la medición por folio. Un archivo
capturado como enseñaba la plantilla hasta hoy —una fila por producto— daría 0% y dispararía
«oportunidad de venta cruzada» contra todos. Es el mismo error de «ausencia de dato no es dato en
cero» que ya se corrigió dos veces (cartera sin abonos, y 2026-09-11, accesorios).

**Consecuencia.** Es lo que sostiene la versión MENOR: ninguna métrica existente cambia de
criterio. Con el demo de la 1.2.0 la métrica nueva vale 2 de 13. Quedan sin decidir el umbral y el
texto del hallazgo que la juzga.

---

## 2026-09-14 — Plantilla v2: mismas columnas, fórmulas por folio, y la v1 se sigue aceptando

**Contexto.** GOBERNANZA.md §7 paso 6 obliga a versionar la plantilla cuando cambia el contrato.
Las columnas no cambian, pero sí las instrucciones y las fórmulas de las columnas calculadas.

**Decisión.** La plantilla se renombra a `Plantilla_Captura_Reporteria_v2.xlsx`. La v1 **se sigue
aceptando**: tiene las mismas columnas, y un folio por fila sigue siendo válido. La aplicación
ofrece solo la v2 para descargar y **no las distingue por el nombre del archivo** —el cliente lo
va a renombrar—; si hace falta saber cuál es, se deduce del contenido. En la v2 se escriben **por
primera vez** las fórmulas de las filas 3–301, ya a nivel de folio y con el rango `$B$3:$B$1000`.
La plantilla descargable nunca las tuvo fuera de la fila de ejemplo.

**Alternativa descartada.** No quedó registrada.

**Consecuencia.** **El nombre «plantilla v2» cambia de dueño.** En la entrada del 2026-09-13
(«La plantilla se edita a mano»), en GOBERNANZA.md §11 y en ROADMAP.md (v1.3) designaba el
rediseño con hojas como tablas de Excel. Desde aquí ese es «el rediseño de la plantilla», y v2 es
esta. Aquella entrada dio razones para no hacer a mano una plantilla nueva; esta sí se edita a
mano sobre su XML, con cerca de 1,200 fórmulas, la misma clase de cirugía que dejó 1,297 filas sin
cerrar. La cerca es la prueba de XML bien formado de `plantilla.test.ts`. Queda sin decidir qué
muestran `cobrado` y `saldo` en la segunda partida de un folio.

---

## 2026-09-14 — Los seis pasos de §7 van en orden estricto solo cuando cambian columnas

**Contexto.** GOBERNANZA.md §7 fija seis pasos «en este orden», con `schema.ts` y la plantilla
primero. En la v1.2.0 no cambia ninguna columna: cambia lo que significan.

**Decisión.** El orden es **obligatorio cuando cambian columnas** y **flexible cuando solo cambia
el significado**. En esta fase se hace CLAUDE.md, después el motor, y después plantilla y
exportación.

**Alternativa descartada.** Mantener el orden estricto siempre. Obligaría a editar la plantilla
antes de tener el motor que define sus fórmulas.

**Consecuencia.** El orden estricto existe para que esquema y plantilla no se desincronicen
mientras tanto. Aquí no pueden: los encabezados son los mismos y la prueba de encabezados sigue
pasando en cada paso intermedio. Anotado en GOBERNANZA.md §7.

---

## 2026-09-14 — La v1.2.0 es MENOR: quitar la unicidad del folio es relajar, no romper

**Contexto.** `operaciones` y `ticket_promedio` cambian de unidad, de filas a folios, y
GOBERNANZA.md §3 pide MAYOR cuando cambia una definición de cálculo que altera cifras ya
reportadas. Hasta el 2026-10-10 nadie había argumentado por qué la fase es MENOR.

**Decisión.** MENOR, 1.2.0. Quitar la unicidad del folio es una relajación. **Ningún archivo que
hoy se procesa correctamente cambia una sola cifra**: si cada folio tiene una partida, la cuenta
de folios es igual a la de filas y `operaciones` y `ticket_promedio` dan lo mismo. Los únicos
archivos cuyas cifras cambian son los que hoy traen folios repetidos, y esos hoy están mal
calculados.

**Alternativa descartada.** MAYOR, por el cambio de unidad de `operaciones` y `ticket_promedio`.
La unidad solo cambia en archivos que hoy no se calculan bien.

**Consecuencia.** Un folio repetido hoy **no bloquea nada**: el error se anuncia, pero las filas
entran al motor y cada una resta todo lo cobrado del folio, así que ese cobrado se cuenta una vez
por fila. Ejecutado el 2026-10-10 sobre la 1.1.5 con datos inventados: un folio de dos filas,
$100,000 y $10,000, con un abono de $60,000, da cobrado $120,000 y saldo −$10,000; lo correcto es
$60,000 y $50,000. Quien tenga folios repetidos vio cifras mal calculadas, no solo marcadas con
error, y cuando cambien con la 1.2.0 tiene que entender que las nuevas son las correctas: va a
`docs/notas-version.md`. §3 no tiene todavía este caso escrito, como sí tiene el de la 1.1.1.

---

## 2026-09-14 — El demo gana dos folios con varias partidas, y tres cifras cambian de unidad

**Contexto.** El fixture tiene que ejercitar el modelo nuevo sin perder los casos límite que ya
cubre, y sus cifras de referencia no se ajustan para que pase una prueba (GOBERNANZA.md §1).

**Decisión.** Dos uniones en el demo: **V-008 con V-009** y **V-015 con V-016**. En V-009 se deja
vacía `condicion`; V-016 conserva «Contado» contra una cabecera que dice «Credito», a propósito:
así el demo ejercita la cabecera heredada y la cabecera en conflicto. Los casos de pagos en orden
de entrega y de anticipos se prueban con datos armados en código, como `lineaDemo.test.ts`, **no
añadiendo ventas al demo**. El anticipo se crea adelantando la fecha de un pago existente, lo que
mueve solo el cobro por mes de Ventas y flujo.

**Alternativa descartada.** Unir también V-017 con V-018. Dentro del folio el sobrecobro de V-018
se netea contra el saldo de V-017 y el caso límite del fixture desaparece.

**Consecuencia.** No se mueven `venta_total`, `costo_total`, `utilidad_bruta`, `cobrado` ni
`saldo`. Cambian por definición `operaciones` (24 → 22), `ticket_promedio` ($204,404.55) y aparece
la venta cruzada por folio (2 de 13). No es ajustar una cifra: la métrica cambió de unidad, y cada
una se explica en `docs/notas-version.md` con qué medía antes y qué mide ahora. Comprobado el
2026-10-10 contra el archivo de demostración, por aritmética y sin ejecutar el motor nuevo, que no
existe: 4,496,900 / 22 = 204,404.55; hay 13 folios con equipo y 2 traen accesorio; cada pareja
comparte cliente, fecha y vendedor, así que su saldo cae en el mismo tramo que hoy y el aging no
se mueve; el attach rate por cliente sigue en 3 de 10. Los abonos P-012 y P-021 apuntan hoy a
V-009 y V-016 y hay que reapuntarlos al folio que sobreviva.

---

## 2026-10-10 — Una decisión se escribe en el repositorio en la misma sesión en que se toma

**Contexto.** El alcance completo de la v1.2.0 —las once entradas anteriores— se decidió el
2026-09-14 y se guardó en un archivo de memoria fuera del repositorio, para escribirlo aquí al
implementar. Un formateo del equipo borró esa memoria. El repositorio sobrevivió intacto. Una
sesión nueva, con solo la documentación, encontró cinco viñetas en ROADMAP.md y ninguna entrada
aquí: no pudo arrancar la fase.

**Decisión.** Una decisión que no está en `docs/decisiones.md` no existe. Se escribe en el
repositorio **en la misma sesión en que se toma**, no al implementarla. Queda en GOBERNANZA.md §9.

**Alternativa descartada.** Registrarla al implementar, que era la práctica: ROADMAP.md §4 decía
«registrar en `docs/decisiones.md` al implementarlas». Deja la decisión, durante semanas, en el
único lugar que no tiene respaldo ni historial.

**Consecuencia.** Lo reconstruido salió de la memoria de una persona, y tiene huecos: cuatro
entradas no traen su alternativa descartada. Una entrada puede describir algo todavía no
implementado; lo dice, y CLAUDE.md lo marca igual. ROADMAP.md §4 ya no dice «al implementarlas»;
sus seis decisiones, AD-01 a AD-06, siguen fuera de este registro y migrarlas queda en el backlog
(GOBERNANZA.md §11).

---

## 2026-10-10 — El lockfile se regenera con las seis entradas empaquetadas de Tailwind

**Contexto.** Desde el 2026-09-14 el backlog registraba que `npm install --package-lock-only`
agregaba seis entradas al lockfile —`@emnapi/core`, `@emnapi/runtime`, `@emnapi/wasi-threads`,
`@napi-rs/wasm-runtime`, `@tybys/wasm-util` y `tslib`—, que entonces se tomaron por ajenas y se
descartaron. Se averiguó qué son antes de decidir:

- Son las **dependencias empaquetadas** de `@tailwindcss/oxide-wasm32-wasi`, la variante en
  WebAssembly del motor nativo de Tailwind, que es una dependencia opcional para las plataformas
  sin binario propio. El lockfile ya la listaba, con esos seis nombres en `bundleDependencies`.
  Las entradas nuevas llevan `inBundle: true` y no traen `resolved` ni `integrity`: no se
  descargan aparte, vienen dentro del tarball de ese paquete, cuyo hash no cambia.
- **Depende del comando, no de la plataforma.** `npm install` completo deja el lockfile sin ellas,
  porque nunca desempaca un paquete que no es para este procesador. `--package-lock-only` sí lo
  resuelve y las escribe. Pedir el lockfile para `win32/x64` desde WSL2 (`--os`, `--cpu`) dio el
  mismo archivo, byte a byte, que para Linux. No se ejecutó en un Windows real.
- Los dos lockfiles son válidos, pero solo uno es estable. Con las seis entradas, `npm install`,
  `npm install --package-lock-only` y `npm ci` lo dejan igual. Sin ellas, `--package-lock-only`
  lo cambia.

**Decisión.** Se regenera: el lockfile lleva las seis entradas. En la misma sesión, `npm audit fix`
sube `source-map-js` de 1.2.1 a 1.2.2 (GHSA-68fv-2mgg-jv7q): tres líneas del lockfile, una
dependencia transitiva y solo de desarrollo, sin tocar `package.json`.

**Alternativa descartada.** Dejar el lockfile sin las seis entradas y restaurarlo cada vez que un
comando las agregue, como se hizo el 2026-09-14. Obliga a recordar que ese diff «no cuenta», y un
diff que se aprende a ignorar es donde se cuela el que sí importa.

**Consecuencia.** Verificado el 2026-10-10 con npm 11.19.0 y Node 24.21.0: `npm ci`, las 650
pruebas, `typecheck`, `lint` y `build` en verde, `npm audit` sin hallazgos, y los 8 archivos de
`dist/` idénticos por SHA-256 a los del build con el lockfile anterior. Sin incremento de versión:
son herramientas, no contrato ni cifras. Nada de esto se instala en Linux ni en Windows x64; el
lockfile solo describe completo un paquete que ya describía a medias. Otra versión de npm podría
escribirlo distinto: no está comprobado.

**Las seis entradas no eran ajenas: faltaban.** Durante semanas se trataron como ruido. Quien las
vea en un diff no las borra, y quien vea un diff que las **quita** desconfía de él: `npm install`
completo no las escribe, `--package-lock-only` sí, y el lockfile correcto es el que las trae.
