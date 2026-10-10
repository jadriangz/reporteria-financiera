---
description: Verifica en cuatro planos (GOBERNANZA.md §5 paso 5) — pruebas, tipos, lint, build, recorrido visual (humo por omisión, matriz de 48 estados con «todo») y PDF contra la línea base
argument-hint: "[todo] | [360|768|1024|1440] [claro|oscuro] [módulo] — sin argumentos, humo: 1440 px, claro, seis módulos"
allowed-tools: Bash(npm run test), Bash(npm run typecheck), Bash(npm run lint), Bash(npm run build), Bash(npm run dev), Bash(npm run preview), Bash(git status:*), Bash(git diff:*), Bash(base64:*), Read, Glob, Grep, Write
---

# Verificación en cuatro planos

Lee `CLAUDE.md` y `GOBERNANZA.md` antes de empezar: el contexto permanente manda, y las cifras
de referencia y las reglas de layout de `CLAUDE.md` son el criterio con el que vas a juzgar lo
que veas. Este comando implementa el paso 5 de la sección 5 de GOBERNANZA.md.

Estado al invocar: !`git status --short --branch`

## Alcance

`$ARGUMENTS` elige el recorrido de la Fase B. Tres formas:

| Invocación | Recorrido | Estados |
|---|---|---|
| `/verificar` | **Humo**: 1440 px, tema claro, los seis módulos | 6 |
| `/verificar todo` | **Matriz completa**: cuatro anchos (360, 768, 1024, 1440) × dos temas (claro, oscuro) × seis módulos | 48 |
| `/verificar <filtros>` | Solo los estados de la matriz completa que contengan los filtros — `360 oscuro` es un ancho y un tema con los seis módulos; `cobranza` es un módulo en toda la matriz | según filtros |

Las Fases A y C corren **siempre completas**, en las tres formas: no tiene sentido acotarlas. Solo
la Fase B cambia de tamaño.

### Por qué el valor por omisión es el humo y no la matriz

Cuarenta y ocho estados están bien al cerrar una fase, y para eso está `todo`. Pero a ese costo el
comando no se usa entre sesiones, y **una verificación que no se corre no verifica nada**. El humo
cuesta un octavo y se puede correr cada vez; la matriz se reserva para el cierre.

El humo **no verifica los otros 42 estados**. En el reporte se declaran `no verificado`, en una
línea, con la razón «fuera del recorrido de humo»; nunca se cuentan como limpios. Si el diff toca
layout o tokens —`src/index.css`, `src/components/ui/`, las reglas de tabla o de gráfica—, dilo
en el reporte y recomienda `todo` o el filtro que corresponda. Recomiéndalo, no lo corras por tu
cuenta.

## Regla que gobierna todo el comando

**Lo que no observaste no está verificado.** Cada resultado se reporta como `verificado`,
`no verificado` o `falla`, y `no verificado` es una respuesta legítima y frecuente. No
aproximes, no infieras, no rellenes. GOBERNANZA.md sección 6: «cuando diga que no pudo verificar
algo, no tratarlo como verificado».

---

## Paso 0 — Conseguir el navegador, antes que todo

Llama a `tabs_context_mcp` (herramienta `mcp__claude-in-chrome__tabs_context_mcp`, con
`createIfEmpty: true`). Es la prueba de que hay navegador, y la primera llamada de toda sesión
de navegador.

Hay dos casos distintos en los que no responde, y se tratan distinto:

- **Las herramientas `mcp__claude-in-chrome__*` no aparecen, ni con `ToolSearch`.** Eso **no
  prueba que falte el navegador**. Observado el 2026-09-14 en la extensión de VS Code: con la
  extensión de Chrome conectada, las herramientas no estaban cargadas en la sesión, y buscarlas
  otra vez no las cargó. Aparecieron en cuanto el usuario escribió `@browser` en su mensaje.
  Pídele que vuelva a invocar el comando mencionando `@browser`.
- **La herramienta responde «Browser extension is not connected».** Aquí sí falta la conexión.
  Pídele que reconecte la extensión (en la CLI, `/chrome` → «Reconnect extension») y que vuelva a
  invocar el comando.

En los dos casos **detente de inmediato, sin correr la Fase A**, y reporta las tres fases como
`no verificado`. La Fase A corre completa en la siguiente invocación; correrla ahora solo retrasa
dos minutos el aviso de que falta el navegador.

No sustituyas el recorrido por capturas imaginadas ni por lectura del código: el recorrido
visual es visual.

Si hay navegador, crea tu propia pestaña con `tabs_create_mcp` y ciérrala al terminar. Mientras
corre la Fase A puedes adelantar B.1: son independientes.

Tres particularidades de la extensión, observadas el 2026-09-14. Cada una cuesta media hora si no
se sabe:

- **Mide solo con la pestaña visible.** Con `document.visibilityState` en `hidden` —la ventana de
  Chrome detrás de otra, u otra pestaña activa en esa ventana— Chrome no pinta. El
  `ResizeObserver` no se dispara, y las gráficas se quedan con ancho 0: salen girando y abreviando
  rótulos que a su ancho real no tocarían. Parecen defectos y no lo son. Engaña porque
  `getBoundingClientRect` y la medición de texto sí funcionan con la pestaña oculta, así que las
  cifras parecen coherentes. Antes de medir, comprueba que `document.visibilityState` sea
  `visible`. Si no, pide al usuario que traiga al frente **la pestaña del grupo de Claude**, no
  otra pestaña de la misma aplicación.
- **Una corrida larga de JavaScript no cabe en una sola llamada**: `browser_batch` vence el
  tiempo. Lánzala sin esperar, guarda el resultado en `window.__resultado` y consúltalo en otra
  llamada.
- **La extensión bloquea las salidas que parecen una query** («[BLOCKED: Cookie/query string
  data]»). Cualquier texto devuelto con `=` puede caer ahí, aunque no sea una query. Arma la
  salida con `:` o `|`.

---

### Alternativa cuando la extensión no carga: Chrome sin ventana

Si el usuario ya volvió a invocar el comando con `@browser` y las herramientas siguen sin aparecer,
hay un camino que **sí observa**, y es válido siempre que el reporte diga con qué se observó. Se usó
por primera vez el 2026-10-10, desde WSL2 contra el Chrome de Windows.

**Cómo.** Se lanza `chrome.exe --headless=new --remote-debugging-port=<puerto>
--user-data-dir=<carpeta temporal>`: un perfil desechable, nunca el del usuario. Se maneja por el
protocolo de depuración: `Page.navigate`, `Runtime.evaluate` (con `awaitPromise` para esperar dentro
de la página), `Emulation.setDeviceMetricsOverride` para el ancho, `Page.captureScreenshot` y
`Page.printToPDF`. El tema se cambia con el selector de la barra superior, y los datos con
`?fixture=demo` o con B.4, igual que con la extensión. Al terminar se cierran ese Chrome y vite, y
se borra la carpeta temporal.

**Lo que NO demuestra.** Tres límites, que van en el reporte y en la línea base cada vez:

1. **El PDF no sale del diálogo «Guardar como PDF».** `Page.printToPDF` con `preferCSSPageSize`
   usa el mismo motor (Skia/PDF) y respeta el `@page` de la hoja de estilos, y `displayHeaderFooter`
   equivale a la casilla «Encabezados y pies de página». Pero no es el diálogo operado a mano: lo
   que una persona haga ahí con sus opciones no queda observado.
2. **Ninguna hoja se mira como imagen** si el equipo no tiene con qué rasterizar un PDF. Se lee su
   texto, sus posiciones y sus colores con un lector de PDF instalado **fuera del repositorio**.
   «Sale en claro» se apoya entonces en que ninguna hoja traiga el relleno oscuro de hoja completa,
   no en haberla visto. Un invariante del papel se verifica en el papel: esto es lo más cerca que
   se llega sin él, y hay que decirlo.
3. **El ancho se emula en la ventana**, no con el banco de iframes de B.3. Es una emulación de
   viewport real, y el layout responde a ella, pero no es el mismo método que el de las corridas
   anteriores.

**Lecciones de esa corrida**, cada una cuesta un rato:

- **Desde WSL2 no se alcanza el puerto de depuración de un Chrome de Windows**: está en el
  `127.0.0.1` de Windows. Windows sí alcanza a vite en WSL por `localhost`. El puente fue un guion
  de PowerShell con `ClientWebSocket` que manda un lote de comandos y guarda las respuestas.
- **`chrome.exe --version` en Windows no imprime la versión: abre el navegador.** La versión se lee
  con `Browser.getVersion`.
- **`pkill -f vite` mata también al propio shell** si su línea de comando contiene «vite». Se apaga
  por el puerto que se leyó de la salida de vite, y se confirma que quedó libre.
- **La captura con el medio de impresión emulado salió en negro.** No sirve para mirar el papel.
- La pestaña sin ventana está siempre `visible`, así que la trampa de las gráficas con ancho 0 no
  aplica; aun así, comprueba que las gráficas tengan ancho antes de dar por bueno un estado.

## Fase A — automático

En este orden, uno por uno, reportando el veredicto y la salida relevante de cada uno:

1. `npm run test`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run build`

Tres cosas que hay que saber para no reportar ruido:

- **Si `test` o `typecheck` salen en rojo, detente aquí.** No sigas al recorrido visual:
  `CLAUDE.md` dice que no se pasa al siguiente paso con pruebas en rojo. Reporta la Fase A y deja
  B y C como `no verificado`.
- **`docs/contraste.md` modificado después de `test` es normal**: la suite lo regenera. No es un
  cambio pendiente. Pero si su **contenido** cambió, los tokens de `src/index.css` se movieron y
  eso sí hay que reportarlo, con el diff.
- **Después de `build`, comprueba que el cargador de desarrollo no llegó a producción.** En
  `dist/` no debe aparecer `fixtureDesarrollo`, ni `activarFixtureDesarrollo`, ni la bandera
  `fixture=demo`, ni un chunk de `src/dev`. **Cuidado con el falso positivo:** `dist/assets/`
  **sí** contiene `DEMO_Agrodrones_Bajio_FICTICIO-<hash>.xlsx` y
  `Plantilla_Captura_Reporteria_v1-<hash>.xlsx`, y es correcto: `ZonaCarga` los ofrece como
  descarga. Lo que no debe estar es el código ni la bandera, no el archivo.

---

## Fase B — recorrido visual

### B.1 Levantar la aplicación

`npm run dev` en segundo plano y **lee la URL de la salida de vite**. No la des por sentada:
`vite.config.ts` no fija `port` ni `strictPort`, así que si 5173 está ocupado vite sube al
siguiente puerto sin avisar.

Al terminar el comando, apaga el servidor. Dos lecciones de la primera corrida (2026-09-14):

- **No edites archivos del repositorio mientras vite corre**, ni documentación ni este comando.
  vite vigila el proyecto y recarga las pestañas: se pierde lo cargado con B.4 y cualquier estado
  armado a mano. Anota lo que haya que cambiar y edítalo con el servidor apagado.
- **`TaskStop` no apaga vite en Windows.** Detiene la tarea, pero el proceso `node` sigue vivo con
  el puerto ocupado, y la siguiente corrida sube a otro puerto sin avisar. Mátalo por el puerto que
  leíste de la salida de vite, y confirma que quedó libre:

  ```powershell
  Get-NetTCPConnection -LocalPort <puerto> -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
  ```

### B.2 Cargar los datos

Navega a `<url>/?fixture=demo`. Eso carga `docs/DEMO_Agrodrones_Bajio_FICTICIO.xlsx` y fija la
fecha de corte en **2026-09-09** sin intervención humana. Es un parámetro exclusivo de
desarrollo; ver `src/dev/fixtureDesarrollo.ts`.

Confirma en la consola el mensaje `[dev] fixture cargado, corte 2026-09-09` antes de seguir. Si
no aparece, el recorrido no es válido: el corte fijo es lo que hace que el aging coincida con la
tabla de cifras de `CLAUDE.md`. Con «hoy» reportarías discrepancias que no existen.

Verifica de paso que el panel de validación sale con lo esperado del demo: la fila `Demo`
excluida como info, el sobrecobro de V-018 y la venta sin fecha de V-025 como advertencias.

### B.3 Recorrer la matriz

Para cada ancho, para cada tema, para cada módulo. El tema se cambia con el selector de la barra
superior, no emulando el sistema.

**El ancho se fija con un banco de iframes, no con la ventana.** Observado en la primera corrida
(2026-09-14): con la ventana de Chrome maximizada, `resize_window` no cambia nada, y
`window.resizeTo` reporta éxito sin cambiar nada. Lo que funciona es escribir desde la pestaña de
la aplicación un `iframe` de ancho exacto —360, 768, 1024 o 1440 px— con `<url>/?fixture=demo`, y
medir dentro de `iframe.contentWindow`. El iframe es del mismo origen, así que su documento se lee
desde fuera. Su viewport mide lo que mide el iframe, así que el layout responde a ese ancho y no al
de la ventana. El desbordamiento se mide sobre el `scrollingElement` del documento del iframe, no
sobre la página que lo contiene.

Si aun así un ancho no se puede alcanzar, repórtalo como `no verificado` **para ese ancho**. No lo aproximes con 400 ni
con 500: un layout que responde al contenido se juzga al ancho que se pidió.

### B.4 Cargar un archivo distinto del demo

`?fixture=demo` solo carga el demo. Hay verificaciones que necesitan otro archivo: una copia del
demo con un parámetro ilegible, un CSV con una sola hoja, un Excel exportado. **Esos archivos se
preparan fuera del repositorio**, en el scratchpad de la sesión: ningún archivo de prueba entra a
`docs/` (GOBERNANZA.md, sección 10).

La puerta es `ZonaCarga`, que solo se muestra sin datos cargados: navega a `<url>/` sin
`?fixture`, o pulsa «Limpiar» en la barra superior. Su control es un `input[type=file]`
visualmente oculto (`sr-only`), dentro de la zona de arrastre. Sin el fixture, la fecha de corte
es «hoy»: si vas a comparar cifras, fíjala en 2026-09-09 con el control de la barra superior.

Tres métodos, en este orden:

1. **Herramienta de subida de Claude in Chrome.** Localiza el `input` con `find` o `read_page` y
   llama a `file_upload` con su `ref` y la ruta absoluta. No hagas clic en el control: abre el
   selector nativo, que no se automatiza. La herramienta solo acepta archivos que la sesión
   puede leer por permiso del usuario. **Rechaza el scratchpad** —observado en la primera
   corrida, 2026-09-14: «only files this session is allowed to read can be uploaded»—, así que
   con archivos preparados ahí pasa directo al método 2.
2. **Inyección con `DataTransfer`.** La página no puede leer el disco, así que los bytes llegan
   de una de dos formas:
   - **Variante del demo** (cambiar una celda, quitar una hoja): se construye en la página con
     el mismo SheetJS de la aplicación, sin pasar por el disco. `await
     import('/node_modules/xlsx/xlsx.mjs')`, `fetch` del demo que ofrece `ZonaCarga`
     (`a[download="DEMO_Agrodrones_Bajio_FICTICIO.xlsx"]`), `read`, cambiar la celda, `write`
     con `{ type: 'array', bookType: 'xlsx' }`. Es el camino barato: el archivo no se vuelve
     texto. SheetJS reescribe el libro sin estilos, lo que no afecta al lector de la aplicación.
   - **Archivo arbitrario ya preparado:** en base64. En Bash, `base64 -w0 <archivo>`. Un CSV se
     puede pasar como texto, sin base64: `new File([texto], "<nombre>.csv")`.

   Con los bytes en la página, con `javascript_tool`:

   ```js
   const B64 = "<salida de base64>";
   const bytes = Uint8Array.from(atob(B64), (c) => c.charCodeAt(0));
   const archivo = new File([bytes], "<nombre>.xlsx");
   const input = document.querySelector('input[type="file"]');
   const dt = new DataTransfer();
   dt.items.add(archivo);
   input.files = dt.files;
   input.dispatchEvent(new Event("change", { bubbles: true }));
   ```

   El nombre importa: la extensión decide el lector (`.csv` o `.xlsx`) y el nombre aparece en el
   encabezado de cada hoja del PDF. `ZonaCarga` escucha `onChange`, y React lo recibe con un
   `change` que burbujea.
3. **Si ninguno funciona, detente y pídele al usuario que arrastre el archivo** a la zona de
   carga, con la ruta exacta. No lo reportes como verificado mientras no se haya cargado.

Confirma siempre la carga antes de juzgar: el nombre del archivo en la barra superior y el panel
de validación con lo que ese archivo debe producir.

### B.5 El folio con el saldo en dos tramos (v1.2.0)

**El demo no lo trae, a propósito, y sin este paso nadie lo ve.** Sus dos folios con varias
partidas, V-008 y V-015, entregaron todo el mismo día: su saldo cae en un solo tramo. La celda de
antigüedad que lista dos tramos con sus importes —la razón de ser del rediseño de Cobranza— solo
aparece con entregas en fechas distintas. Está probada en código (`partidas.test.ts` y el selector
de Cobranza), pero **cómo se ve** solo se comprueba aquí.

Con B.4, construye en la página la variante del demo: en la hoja `ventas`, la celda `B11` —la fecha
del accesorio de V-008— pasa a `46254`, el 20/08/2026. Cárgala, fija el corte en 2026-09-09 y abre
Cobranza. Lo esperado:

- El renglón de V-008: saldo $165,000, y en Antigüedad **«61 a 90 días $141,000»** y **«0 a 30 días
  $24,000»**, en dos líneas de la misma celda, sin desplegar nada.
- Al desplegarlo: el equipo con $141,000 pendientes a 65 días y el accesorio con $24,000 pendientes,
  todavía sin vencer.
- **La etiqueta de cada tramo en una sola línea, en los cuatro anchos.** A 360 px se partía una
  palabra por renglón («61 / a / 90 / días»), precisa e ilegible (corregido el 2026-10-10).
- En el PDF de esa variante, las mismas dos líneas en la hoja de Cobranza, y la paginación sin
  moverse respecto del demo.

### Qué buscar, con su definición

| Defecto | Cómo se mide |
|---|---|
| **Desbordamiento** | `document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth > 1`. Solo a nivel de página es defecto |
| **Texto encimado** | Cajas que se traslapan. Mira sobre todo rótulos de eje, tarjetas KPI y encabezados de tabla |
| **Controles inalcanzables** | Elementos de `BarraSuperior` y `Navegacion` fuera del viewport, o con área táctil menor a 44 px |
| **Errores de consola** | Cualquier `error`. Los `warning` de React se listan aparte, no como falla |

**Al contar filas de una tabla, cuidado con el detalle desplegable.** Las tablas que despliegan
detalle anidan otra tabla, y `tbody > tr` cuenta también las filas del detalle. Las filas propias
son `:scope > tbody > tr`, y las que despliegan llevan `button[aria-expanded]`. Observado en la
primera corrida (2026-09-14).

### Qué NO es un defecto

Esto es diseño deliberado y está documentado en `CLAUDE.md` («Layout (v1.1)») y en
`docs/decisiones.md`. Reportarlo como error es el ruido más probable de este comando:

- La **gráfica de categorías recorta** a las que caben legibles y declara lo omitido con su
  número y su proporción del ingreso. El eje de tiempo, en cambio, nunca se recorta: baja las
  marcas.
- Las **tablas de detalle** —una fila por operación— conservan la tabla en poco ancho, se
  desplazan a lo ancho dentro de su contenedor y fijan la primera columna. Apilarlas destruiría
  la comparación de cifras, que es el contenido.
- Las **tablas de resumen** —pocas columnas, un renglón por concepto— sí se vuelven tarjetas.
- Dentro de las tablas, el objetivo táctil de 44 px **solo aplica con `pointer: coarse`**: con
  renglones de 26 px, dos áreas de 44 se pisarían.
- Los módulos deshabilitados por falta de datos **se muestran deshabilitados con su motivo**. Con
  el demo no debería haber ninguno, pero un aviso de ese tipo es degradación elegante, no falla.

---

## Fase C — PDF completo contra la línea base

### C.1 Generar

Con el tema **oscuro** activo en pantalla —a propósito: es lo que prueba la inversión—, el reporte
completo se dispara desde la interfaz. Vale también para el recorrido de humo: aunque la Fase B
haya corrido en claro, cambia a oscuro antes de generar.

**El clic en «Descargar PDF» lo da la persona, a mano. No dispares la impresión con clics ni
scripts automatizados.** Observado el 2026-09-14: un PDF disparado así mientras la extensión
actuaba sobre la pestaña salió con los indicadores visuales de la extensión dentro, 115 imágenes
rasterizadas de hoja completa y un cursor dibujado en cada hoja. Pesó 3.7 MB, contra 0.7 MB del
mismo reporte impreso a mano, que no tenía ninguna de las dos cosas. Parecían defectos de la
aplicación y no lo eran. Tú dejas la pestaña lista (datos, corte y tema) y se lo pides.

### C.2 Guardar (esto es manual, y no hay manera de que no lo sea)

El diálogo de impresión de Chrome es nativo y no se automatiza. Pide al usuario que lo cierre
guardando el PDF y que te dé la ruta. Si no lo hace, la Fase C queda `no verificado`. Pídele
también que desactive «Encabezados y pies de página», como dice la corrida canónica de
`docs/linea-base-pdf.md`. **Y compruébalo en el PDF, no en lo que te digan**: busca en su texto
la fecha de impresión y la dirección `localhost`. El 2026-09-14 la casilla se pidió desactivada
en dos impresiones, en la segunda la persona la vio desmarcada en la vista previa, y los dos PDF
salieron con encabezados en las 15 hojas.

**Dale el nombre del archivo sin extensión:** el diálogo agrega `.pdf`, y si la persona la escribe
queda `.pdf.pdf`. **Y comprueba el corte en el título interno del PDF** (`/Title`, que sale de
`nombreArchivoReporte()`), no en el nombre del archivo. Observado el 2026-09-14: un PDF
renombrado a mano con corte 2026-09-09 traía corte 2026-09-14 y una hoja menos, porque se había
impreso sin el corte fijo.

**Mientras el diálogo está abierto, la pestaña no responde**: las capturas vencen y la extensión
puede desconectarse. No es un defecto de la aplicación ni una señal de que algo falló. Espera a
que el usuario guarde, y no dispares nada más en esa pestaña. Observado en la primera corrida
(2026-09-14).

**Si en la misma corrida se imprimen dos PDF, el primero se renombra antes de disparar el
segundo.** Los dos proponen el mismo nombre —`nombreArchivoReporte()` no distingue el archivo de
origen, GOBERNANZA.md §11— y Chrome sobrescribe el primero sin avisar. Observado en la primera
corrida (2026-09-14). Y no des la Fase C por cerrada hasta tener el segundo PDF en disco: en esa
corrida el diálogo quedó abierto, el PDF nunca se guardó y su verificación quedó `no verificado`.

### C.3 Comparar

Contra `docs/linea-base-pdf.md`: orden y títulos de sección, portada con su bloque de Alcance,
orientación apaisada del Estado de resultados, ausencia de la página «Módulos no incluidos»,
número de páginas, saltos de página y cifras clave.

Cada diferencia se reporta como **cambio esperado** o **regresión**. Cuando no sea obvio cuál de
los dos, dilo y pregunta: no lo decidas tú.

Verifica además los invariantes del papel que lista el manifiesto: sale en claro, las gráficas
salen claras, la gráfica de categorías no recorta, el layout es el de escritorio, y el nombre
propuesto del archivo es el de `nombreArchivoReporte()`.

Si `docs/linea-base-pdf.md` tiene casillas sin llenar en «Por confirmar en la primera corrida»,
llénalas con lo que observes y dilo en el reporte: esa corrida fija la línea base en esos puntos
y el usuario tiene que revisarla antes de commitear.

Si el manifiesto no existe, genéralo a partir de `ORDEN_REPORTE` y `planImpresion()` y reporta
que **esta corrida no comparó nada**.

---

## Reporte final

1. **Paso 0 y Fase A**: si hubo navegador, y los cuatro scripts con su veredicto, más la
   comprobación del artefacto.
2. **Fase B**: primero qué recorrido fue —humo, `todo` o filtros— y cuántos de los 48 estados
   cubrió. Después una tabla de estados (ancho × tema × módulo) con los defectos encontrados. No
   repitas los estados limpios uno por uno: agrúpalos y detalla solo lo que falló. Los estados
   fuera del recorrido van en una sola línea como `no verificado`. Si cargaste archivos distintos
   del demo, di con qué método (B.4).
3. **Fase C**: diferencias contra la línea base, separadas en esperadas y regresiones.
4. **Pendientes humanas**: lo que quedó `no verificado` y por qué.

No declares que la aplicación está bien. Reporta lo que observaste y lo que no.
