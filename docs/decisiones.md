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
