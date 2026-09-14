---
description: Verifica en cuatro planos (GOBERNANZA.md §5 paso 5) — pruebas, tipos, lint, build, recorrido visual (humo por omisión, matriz de 48 estados con «todo») y PDF contra la línea base
argument-hint: "[todo] | [360|768|1024|1440] [claro|oscuro] [módulo] — sin argumentos, humo: 1440 px, claro, seis módulos"
allowed-tools: Bash(npm run test), Bash(npm run typecheck), Bash(npm run lint), Bash(npm run build), Bash(npm run dev), Bash(npm run preview), Bash(git status:*), Bash(git diff:*), Read, Glob, Grep, Write
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

### B.0 Conseguir el navegador

Intenta la herramienta de navegador con `@browser`. Si este entorno no la expone, la extensión
Claude in Chrome no está conectada: **detente**, dile al usuario que ejecute `/chrome` y vuelva a
invocar el comando, y reporta la Fase A junto con B y C como `no verificado`. No la sustituyas
por capturas imaginadas ni por lectura del código: el recorrido visual es visual.

### B.1 Levantar la aplicación

`npm run dev` en segundo plano y **lee la URL de la salida de vite**. No la des por sentada:
`vite.config.ts` no fija `port` ni `strictPort`, así que si 5173 está ocupado vite sube al
siguiente puerto sin avisar.

Al terminar el comando, apaga el servidor.

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

Si un ancho no se puede alcanzar —Chrome tiene un ancho mínimo de ventana y 360 px puede quedar
fuera de alcance—, repórtalo como `no verificado` **para ese ancho**. No lo aproximes con 400 ni
con 500: un layout que responde al contenido se juzga al ancho que se pidió.

### Qué buscar, con su definición

| Defecto | Cómo se mide |
|---|---|
| **Desbordamiento** | `document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth > 1`. Solo a nivel de página es defecto |
| **Texto encimado** | Cajas que se traslapan. Mira sobre todo rótulos de eje, tarjetas KPI y encabezados de tabla |
| **Controles inalcanzables** | Elementos de `BarraSuperior` y `Navegacion` fuera del viewport, o con área táctil menor a 44 px |
| **Errores de consola** | Cualquier `error`. Los `warning` de React se listan aparte, no como falla |

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

Con el tema **oscuro** activo en pantalla —a propósito: es lo que prueba la inversión—, dispara
el reporte completo desde la interfaz. Vale también para el recorrido de humo: aunque la Fase B
haya corrido en claro, cambia a oscuro antes de generar.

### C.2 Guardar (esto es manual, y no hay manera de que no lo sea)

El diálogo de impresión de Chrome es nativo y no se automatiza. Pide al usuario que lo cierre
guardando el PDF y que te dé la ruta. Si no lo hace, la Fase C queda `no verificado`.

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

1. **Fase A**: los cuatro scripts con su veredicto, más la comprobación del artefacto.
2. **Fase B**: primero qué recorrido fue —humo, `todo` o filtros— y cuántos de los 48 estados
   cubrió. Después una tabla de estados (ancho × tema × módulo) con los defectos encontrados. No
   repitas los estados limpios uno por uno: agrúpalos y detalla solo lo que falló. Los estados
   fuera del recorrido van en una sola línea como `no verificado`.
3. **Fase C**: diferencias contra la línea base, separadas en esperadas y regresiones.
4. **Pendientes humanas**: lo que quedó `no verificado` y por qué.

No declares que la aplicación está bien. Reporta lo que observaste y lo que no.
