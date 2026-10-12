# Gobernanza del proyecto — Generador de Reportería Financiera

Manual de control y evolución. Cubre cómo se versiona, cómo entra un cambio, cómo se
trabaja con Claude Code y qué no se toca sin discutirlo.

Vive en la raíz del repositorio. Si una práctica cambia, se cambia aquí primero.

---

## 1. Principios

Cinco reglas que no se negocian por conveniencia de una entrega:

**El motor de cálculo es sagrado.** `src/lib/calc/` son funciones puras con pruebas.
Ningún componente calcula. Esa separación es lo que permite cambiar la fuente de datos
—de Excel a la API de Odoo— sin reescribir la aplicación. Es el activo más valioso del
proyecto.

**Ausencia de dato no es dato en cero.** Si falta información, se dice que falta. Nunca
se rellena con cero, con un promedio ni con una estimación silenciosa. Un hueco honesto
es infinitamente mejor que un número inventado en un reporte financiero.

**Nada sale del navegador.** Sin backend, sin base de datos, sin telemetría. Es
restricción de arquitectura y argumento de venta a la vez.

**Degradación elegante.** Datos incompletos deshabilitan módulos con explicación; no
rompen la aplicación ni producen resultados parciales disfrazados de completos.

**Las cifras se verifican, no se ajustan.** Cuando un número no cuadra contra un valor
esperado, el error está en el código hasta que se demuestre lo contrario. Nunca se
modifica la cifra esperada para que pase la prueba.

---

## 2. Estado actual

**v1.1.5, en producción desde el 2026-09-14.** Verificado comparando por SHA-256 los archivos que
sirve `reporteria-financiera.vercel.app` contra el build local del commit fusionado —8 de 8
idénticos—, y no con el estado del despliegue. El método está en la sección 5, paso 6. Hasta la
fusión del PR #1, producción servía 1.1.0 aunque la serie 1.1.1–1.1.4 ya estaba terminada: el
trabajo sin commit no llega al cliente. Qué cambió en cada versión, para quien ya usaba la
aplicación, y si sus cifras pueden moverse: `docs/notas-version.md`.

**v1.0 — MVP.** Seis módulos de reporte, carga de Excel/CSV, captura manual, exportación a
Excel, exportación a PDF por impresión del navegador y validación en tres niveles de severidad.

**v1.1.0 — interfaz.** Sin cambios de contrato ni de cifras:

- **Temas claro, oscuro y sistema**, con contraste AA verificado por prueba en los dos y la
  impresión siempre en claro.
- **Layout responsivo por contenido**, no por dispositivo: rejillas `auto-fit`, consultas de
  contenedor, y tablas que eligen entre volverse tarjetas o desplazarse a lo ancho.
- **Panel de validación con semáforo**: el tono del encabezado resume la severidad antes de
  abrir el detalle.

**Después de v1.1.0, sin incremento de versión.** No están en el tag `v1.1.0`:

- **Herramientas y documentación:** los tres comandos de proyecto —`/verificar`, `/terminado`
  y `/preparar`— (sección 6), el parámetro de desarrollo `?fixture=demo` y la línea base del
  PDF.
- **Plantilla:** su XML reparado (1,297 filas sin cerrar), sin la lista de modelos del cliente
  de drones y con «Modelo A» como ejemplo.

**v1.1.1 a v1.1.4 — serie de parches del contrato de datos.** Desplegada en producción el
2026-09-14, con el PR #1 y las etiquetas `v1.1.1` a `v1.1.4`. Cuatro defectos con la misma
causa: el contrato prometía algo que el esquema no verificaba, y cada consumidor coercionaba
por su cuenta.

- **v1.1.1:** una fila `linea` «demo» ya no se cuenta como venta.
- **v1.1.2:** `comision_base` y las seis columnas de lista se canonizan, y lo no reconocido se
  avisa.
- **v1.1.3:** la hoja `parametros` se valida como capa.
- **v1.1.4:** los parámetros sustituidos se ven junto a la cifra y en la portada del PDF, y los
  números y fechas de las hojas de datos validan su dominio.

La serie deja una restricción en `CLAUDE.md`: toda coerción del contrato vive en el esquema.

**v1.1.5 — defectos de presentación**, sin cambios de contrato ni de cifras: el PDF impreso desde
el tema oscuro sale en claro de orilla a orilla, los rótulos de la gráfica de modelos ya no se
enciman ni se cortan, los marcos del PDF se ven cerrados y la plantilla deja de prometer fórmulas
que no trae. Desplegada en producción el 2026-09-14, con el PR #3 y la etiqueta `v1.1.5`. Detalle
en `docs/notas-version.md`.

Fuera de alcance en v1, por decisión: autenticación, multiusuario, persistencia,
histórico entre cortes, conexión a Odoo, multimoneda, consolidación de varias empresas.

---

## 3. Versionado

Versionado semántico adaptado al contexto: lo que rompe aquí no es una API pública, es
**el contrato de datos** y **la confianza en las cifras**.

| Incremento | Cuándo | Ejemplos |
|---|---|---|
| **MAYOR** (2.0.0) | Cambia el contrato de datos de forma incompatible, o cambia una definición de cálculo que altera cifras ya reportadas | Renombrar una columna de la plantilla; cambiar la fórmula del DSO; modificar los tramos de antigüedad |
| **MENOR** (1.1.0) | Módulo nuevo, campo opcional nuevo, capacidad nueva compatible hacia atrás | Módulo de inventario; campo `centro_costo` opcional; exportación a CSV |
| **PARCHE** (1.0.1) | Corrección de defecto, ajuste visual, mejora de rendimiento, sin cambio de contrato ni de cifras | Bug de zona horaria; corte de página en el PDF; texto de un insight |

**Regla crítica:** un cambio que altera un número que el cliente ya vio en un reporte es
MAYOR, aunque técnicamente sea un arreglo de una línea. Si el socio vio $1,022,000 el mes
pasado y hoy la app dice $998,000, eso necesita explicación y número de versión que la
justifique.

**Lo que decide es qué cambió, no que las cifras se muevan.** Corregir una divergencia
entre el código y la especificación es **PARCHE**, aunque mueva cifras: la definición que
el cliente tenía no cambió, el código por fin la cumple. Cambiar la especificación —la
definición en `CLAUDE.md`— es **MAYOR**. La regla crítica protege al cliente de cambios
silenciosos de criterio; no obliga a versionar como incompatible el arreglo de un defecto.

*Caso (1.1.1).* `CLAUDE.md` siempre dijo que las filas `linea = "Demo"` se excluyen de todo
cálculo de venta, pero el motor comparaba exacto contra `"Demo"` y contaba como venta una
fila escrita «demo», mientras el panel de validación afirmaba que la había excluido. Quien
la escribió así ve bajar su costo y su utilidad al actualizar. Es PARCHE: la definición es la
misma, y la cifra anterior estaba mal respecto de ella. El arreglo sí se anuncia, con la
versión que lo explica.

**Relajar una restricción del contrato es MENOR cuando ningún archivo hoy válido cambia una
cifra.** Es el caso complementario: allá el código no cumplía la definición; aquí la definición se
amplía para aceptar más, sin mover nada de lo que ya se calculaba bien.

*Caso (1.2.0).* El folio deja de ser único por fila y pasa a agrupar partidas, y con eso
`operaciones` y `ticket_promedio` se cuentan por folio y no por fila. Leído solo, es un cambio de
definición. Pero en un archivo con un folio por fila —todo archivo que hoy carga sin error— la
cuenta de folios es la de filas, y no cambia ninguna cifra. Los únicos archivos que cambian son
los que traen folios repetidos, y esos hoy se calculan mal: el error se anuncia, las filas entran
igual al motor y lo cobrado se cuenta una vez por fila. Es MENOR, y se anuncia igual, para que
quien vio esas cifras sepa que las nuevas son las correctas (`docs/decisiones.md`, 2026-09-14).

La versión vive en `package.json` y se muestra en el pie de la aplicación y en el PDF
exportado. Un reporte sin versión no es auditable.

**La etiqueta va sobre el último commit de la versión, no sobre el que cambia `package.json`.**
Quien saque la etiqueta debe obtener la versión entera, con la documentación que la explica, y
no el código sin ella. `v1.1.5` está sobre `158dd0b`, el commit de documentación que cierra la
versión, y no sobre `9e8f85a`, el que sube el número. Las etiquetas `v1.1.1` a `v1.1.4` son
anteriores a la regla y no se mueven: `v1.1.4` apunta al commit del parche y no al de
documentación que vino después, pero ya están publicadas, y mover una etiqueta publicada causa
más problemas de los que resuelve.

---

## 4. Ramas

```
main          siempre desplegable, protegida, es lo que ve el cliente
  └─ feat/<nombre>    funcionalidad nueva
  └─ fix/<nombre>     corrección de defecto
  └─ chore/<nombre>   dependencias, configuración, documentación
```

Ramas cortas: si una rama vive más de una semana, el alcance estaba mal definido.

`main` nunca recibe commits directos una vez que el cliente tiene la URL. Cada rama abre
un pull request contra `main` y Vercel genera una URL de preview por rama — esa URL es lo
que se comparte para revisión, nunca producción.

**Con un solo desarrollador, revisar la vista previa antes de fusionar cumple el propósito del
PR.** No hay otra persona que lo apruebe. Lo que el PR protege es que nada llegue a `main` sin
haberse visto funcionando, y eso lo garantiza abrir la vista previa de la rama en un navegador
real antes de fusionar. El PR se sigue abriendo, porque deja la fusión registrada con su merge
commit. Así entró la serie 1.1.1–1.1.4 (PR #1, 2026-09-14).

**Mensajes de commit** con prefijo convencional, en español, en imperativo:

```
feat: módulo de inventario con rotación y días de existencia
fix: la fecha de corte tomaba el día UTC en vez del día local
chore: actualiza oxlint a 1.83
docs: registra la decisión sobre escenarios de provisión
```

**Un commit por unidad lógica de cambio.** Hace el historial **legible** —cada commit dice qué
cambió— y **bisecable**: si cada commit compila y pasa pruebas, se puede aislar en cuál apareció un
defecto. **No garantiza que un parche se pueda revertir aislado** cuando un parche posterior toca
las mismas líneas. Comprobado el 2026-09-14 con la serie 1.1.1–1.1.4: revertir cualquiera de sus
commits desde la punta da conflicto en `schema.ts`, `reglas.ts`, `package.json` y la
documentación, y lo que sale limpio es revertir en orden inverso. Aun así, un conflicto de
reversión señala las líneas exactas; un commit que mezcla motor, interfaz y plantilla no deja ni
eso.

---

## 5. Ciclo de vida de un cambio

Seis pasos. No se saltan, aunque el cambio parezca trivial.

**1. Definir el problema, no la solución.** Escribir qué está mal o qué falta, y qué
decisión del usuario mejora. Si no se puede nombrar la decisión que habilita, la
funcionalidad probablemente no hace falta.

**2. Clasificar el impacto.** ¿Toca el contrato de datos? ¿Cambia alguna cifra ya
reportada? Eso determina la versión y si hace falta avisar al cliente antes.

**3. Actualizar `CLAUDE.md` primero.** Si el cambio altera una regla de negocio, una
definición de cálculo o una restricción, se documenta ahí **antes** de escribir código.
`CLAUDE.md` es la especificación; el código es su consecuencia.

**4. Implementar en rama, con pruebas primero donde haya cálculo.** Motor antes que UI.
Nunca al revés.

**5. Verificar en cuatro planos.** Automático (`test`, `typecheck`, `lint`, `build`),
visual en el navegador contra los dos archivos de referencia, impresión a PDF si se tocó
algo que se imprime, y revisión de que las cifras conocidas siguen cuadrando.

**6. Desplegar y anotar.** Merge a `main`, verificar en producción, y registrar la
decisión si hubo alguna no obvia (sección 9).

**Verificar en producción es comparar lo servido, no leer un estado.** Que el despliegue diga
«éxito» no prueba qué se está sirviendo. Hay tres niveles, de menos a más fuerte:

1. **Leer la versión dentro del bundle servido.** Así se descubrió el 2026-09-14 que producción
   seguía en 1.1.0 cuando la serie 1.1.1–1.1.4 ya estaba terminada.
2. **Ver que el nombre del bundle (`index-<hash>.js`) coincide** con el del build local del mismo
   commit. Es un indicio fuerte, porque Vite pone en el nombre un hash del contenido, pero ese
   hash es corto y no prueba igualdad.
3. **Bajar `index.html` y cada archivo de `dist/assets/` desde producción y compararlos por
   SHA-256** contra el build local del commit fusionado. Si todos coinciden, lo servido es
   exactamente lo que se probó. Así se verificó la 1.1.4 el 2026-09-14: 7 de 7 archivos idénticos.

El build local tiene que salir del mismo árbol que se desplegó, y eso se comprueba primero por
hash de árbol. Si con el mismo árbol los bytes difieren, no se concluye que el despliegue esté
mal, porque el entorno de build puede cambiar el resultado: se baja al nivel 1 y se averigua por
qué.

---

## 6. Trabajo con Claude Code

El proyecto se construyó con Claude Code bajo un patrón que funcionó. Conservarlo.

### Una fase por sesión

Nunca "hazme el módulo X completo con su UI y sus pruebas y de paso arregla Y". Una
sesión = un alcance cerrado con criterios de aceptación verificables. Cuando algo sale
mal, se sabe exactamente dónde mirar.

### Anatomía de un prompt

```
1. "Lee CLAUDE.md" — el contexto permanente manda
2. Alcance explícito, y qué queda FUERA del alcance
3. Correcciones pendientes de la sesión anterior, primero
4. Tareas numeradas y verificables
5. Reglas duras y trampas conocidas, explícitas
6. Cifras esperadas cuando las haya, con la instrucción de NO ajustarlas
7. Criterios de aceptación
8. "Si algo contradice CLAUDE.md, detente y pregúntame"
9. "No hagas commit" — la revisión es humana
```

### Reglas de convivencia

- **Nunca "no hagas commit" es opcional.** El commit lo hace una persona después de leer
  el resumen. Es el único punto de control real.
- **Pedir siempre el inventario de componentes con su firma** al terminar. Es lo que
  evita que la sesión siguiente construya una segunda tabla porque no supo que ya existía.
- **Cuando reporte una contradicción o un defecto que no estaba en el prompt, tomarlo en
  serio.** Los mejores hallazgos del proyecto —el `tsc --noEmit` que no revisaba nada, las
  filas de relleno que parecían llenas, la fecha de corte en UTC— salieron así.
- **Cuando diga que no pudo verificar algo, no tratarlo como verificado.** Verificarlo.
- **Si una corrección rompe pruebas viejas, revisar si las pruebas codificaban el error.**
  Suele ser el caso. Exigir que explique qué asumía cada una.
- **En este entorno `set -e` no es confiable.** Las cadenas de comandos llevan una comprobación
  explícita después de cada paso, que las detiene si falla. Observado el 2026-09-14: en una cadena
  con `set -euo pipefail`, `git switch main` falló y la cadena siguió. El avance rápido cayó en la
  rama equivocada, y una comprobación que leía `HEAD` pasó por la razón equivocada. El remoto quedó
  bien solo porque las etiquetas se crearon con hash explícito.

### Comandos del proyecto

Tres comandos en `.claude/commands/` convierten en rutina lo que este manual describe en prosa.
No cambian el proceso: lo ejecutan siempre igual, que es justo lo que la prosa no garantiza.

| Comando | Qué hace | Qué NO hace |
|---|---|---|
| `/verificar` | El paso 5 de la sección 5, en sus cuatro planos: `test`, `typecheck`, `lint` y `build`; recorrido visual de los seis módulos —de humo por omisión, la matriz de cuatro anchos y dos temas con `/verificar todo`—; y el PDF completo contra su línea base | No arregla lo que encuentra, y **no declara verificado lo que no observó** |
| `/terminado` | Recorre la sección 8 casilla por casilla, y la cadena de seis pasos de la sección 7 cuando el cambio toca `schema.ts` | No declara que algo esté terminado: eso lo decide una persona |
| `/preparar` | Resumen de cambios por módulo, confirmación de que `src/lib/calc/` está intacto, verificación del incremento de versión según la sección 3, y propuesta de mensaje de commit | **No hace commit**, ni `git add`, ni rama, ni `push` |

Cinco cosas que conviene saber antes de usarlos:

- **Ninguno commitea.** El commit sigue siendo humano y sigue siendo el único punto de control
  real. Los comandos existen para que esa revisión sea corta, no para reemplazarla.
- **`/verificar` sin argumentos es un recorrido de humo** —1440 px, tema claro, los seis
  módulos, con las fases automática y de PDF completas—; **`/verificar todo` es la matriz de 48
  estados**, y los filtros de ancho, tema y módulo siguen acotando esa matriz. Cuarenta y ocho
  estados están bien al cerrar una fase, pero a ese costo el comando no se usa entre sesiones, y
  una verificación que no se corre no verifica nada. Lo que el humo no recorre se reporta
  «no verificado», nunca limpio.
- **`/verificar` depende de la extensión Claude in Chrome** para la parte visual. Si no está
  conectada, reporta «no verificado» y sigue con lo automático. «No verificado» no es «bien».
- **El recorrido visual carga los datos con `?fixture=demo`**, un parámetro exclusivo de
  desarrollo que fija además la fecha de corte en `2026-09-09`. Sin ese corte fijo el aging
  cambia cada día y la comparación contra las cifras de referencia no significa nada.
- **La línea base del PDF vive en `docs/linea-base-pdf.md`**, no en un binario. Se actualiza solo
  con un cambio deliberado, y ese cambio se registra en `docs/decisiones.md` (sección 9).

La casilla del archivo real de la sección 8 **siempre se reporta como pendiente humana**, nunca
como incumplimiento: ningún archivo con datos de un cliente entra al repositorio (sección 10),
así que verificarlo es, por diseño, trabajo de la persona en su propia máquina.

### Lo que le corresponde a cada quien

Claude Code implementa, prueba y reporta. La persona decide el alcance, resuelve las
ambigüedades de negocio, verifica visualmente y hace commit. Las decisiones de negocio
—qué significa un escenario de provisión, si un cliente en mora se marca en rojo— no se
delegan.

---

## 7. El contrato de datos

El acoplamiento más frágil del proyecto: `src/lib/schema.ts` y
`docs/Plantilla_Captura_Reporteria_v2.xlsx` deben coincidir campo por campo. Si divergen,
la aplicación lee mal el archivo del cliente y nadie se entera hasta que un número sale
raro.

**Cambiar un campo obliga a seis pasos, en este orden:**

1. Actualizar `schema.ts`
2. Editar la plantilla a mano sobre su XML, preservando estilos, listas desplegables y paneles
   fijos
3. Actualizar la exportación a Excel para que siga siendo ida y vuelta
4. Actualizar la prueba que compara encabezados contra la plantilla real
5. Actualizar `CLAUDE.md`
6. **Versionar la plantilla** (`_v2.xlsx`) y decidir si la app soporta ambas

**El orden es obligatorio cuando cambian columnas, y flexible cuando solo cambia el significado.**
Existe para que esquema y plantilla no se desincronicen mientras se trabaja. Si los encabezados no
cambian, no pueden desincronizarse y la prueba de encabezados sigue pasando en cada paso
intermedio. Caso: la v1.2.0 cambia lo que significa `folio` sin tocar ninguna columna, y va
`CLAUDE.md`, motor, y después plantilla y exportación (`docs/decisiones.md`, 2026-09-14).

**No hay generador de la plantilla, y es a propósito.** La versión gratuita de SheetJS escribe
valores, fórmulas, formatos numéricos y anchos, pero no estilos de celda, listas desplegables ni
paneles fijos. La hoja INSTRUCCIONES depende de esa presentación: le dice al cliente «solo escriba
en las celdas de letra azul» y que la fila de fondo verde es el ejemplo. Una plantilla regenerada
sin estilos le daría instrucciones falsas. La cerca contra la divergencia es
`src/lib/parse/__tests__/plantilla.test.ts`, que compara `ENCABEZADOS` contra el .xlsx real y
exige que el XML de cada hoja esté bien formado. Ver `docs/decisiones.md` (2026-09-13).

**Nunca se rompe una plantilla que el cliente ya tiene en sus manos.** Si un campo nuevo
es obligatorio, se acepta su ausencia con advertencia durante al menos una versión.

**Nunca existen dos copias del contrato.** Ya pasó una vez con `docs/schema.ts`. Una sola
fuente de verdad, y punto.

---

## 8. Definición de terminado

Un cambio está terminado cuando cumple **todas**:

- [ ] `npm run test` en verde, con pruebas nuevas que cubren el cambio
- [ ] `npm run typecheck`, `npm run lint` y `npm run build` en verde
- [ ] Sin `any`, sin `@ts-ignore`, sin `localStorage`
- [ ] Verificado visualmente con el archivo de demostración y con uno real
- [ ] Si toca algo imprimible, verificado en el PDF exportado
- [ ] Las cifras de referencia siguen cuadrando
- [ ] `CLAUDE.md` actualizado si cambió una regla
- [ ] Versión incrementada según la sección 3
- [ ] Decisión registrada si hubo alguna no obvia

---

## 9. Registro de decisiones

Toda decisión de diseño con alternativas razonables se registra en `docs/decisiones.md`,
una entrada por decisión:

```markdown
## 2026-09-15 — Los escenarios de provisión son fijos, no configurables

**Contexto.** Los cuatro escenarios coexistían con dos parámetros ajustables y se
confundían entre sí.
**Decisión.** Los escenarios son referencias fijas; los parámetros se muestran aparte
como "Tasas aplicadas".
**Alternativa descartada.** Que los escenarios reflejaran los parámetros — perdía la
noción de rango, que es su razón de existir.
**Consecuencia.** La tabla es comparable entre reportes de distintos meses.
```

Sin esto, en seis meses nadie recuerda por qué el motor conserva las filas `Demo` y
alguien las borra "para simplificar".

**Una decisión que no está en `docs/decisiones.md` no existe.** Se escribe en el repositorio **en
la misma sesión en que se toma**, no al implementarla. Si todavía no está implementada, la entrada
lo dice.

*Caso (v1.2.0).* El alcance completo de la fase de partidas —once decisiones, con sus casos límite
y su fixture— se tomó el 2026-09-14 y se guardó en un archivo de memoria fuera del repositorio,
para registrarlo al implementar. Un formateo del equipo borró la memoria. El repositorio sobrevivió
intacto. La sesión siguiente, con solo la documentación, encontró cinco viñetas en `ROADMAP.md` y
ninguna entrada en el registro, y no pudo arrancar la fase: hubo que reconstruir las decisiones de
lo que una persona recordaba, y cuatro llegaron sin su alternativa descartada. Lo que estaba en el
repositorio no perdió una coma.

---

## 10. Manejo de datos

**Ningún archivo con datos reales de un cliente entra al repositorio.** Ni como fixture,
ni en `docs/`, ni temporalmente. En `.gitignore`:

```
*_CLIENTE*.xlsx
DEMO_datos_completos*.xlsx
/datos-reales/
```

El patrón ignora los demos con datos completos, no todo lo que empiece con `DEMO_`: el archivo
de demostración **ficticio** sí está en el repositorio, a propósito, porque es el fixture de las
pruebas. La línea que separa uno de otro es de dónde salieron las cifras, no cómo se llama el
archivo.

Las pruebas usan el archivo de demostración con datos ficticios. Si una prueba necesita
un caso que solo aparece en datos reales, se reproduce el **caso**, no los datos:
nombres inventados, importes cambiados, misma forma.

Si un archivo real llega a entrar al historial de Git, no basta con borrarlo en un commit
posterior: hay que reescribir el historial y rotar lo que se haya expuesto.

---

## 11. Backlog v2

Priorizado. Lo de arriba entra primero.

**Correcciones y deuda**
- **Quitar las normalizaciones redundantes de los consumidores.** Desde la 1.1.4 toda coerción y
  toda canonización del contrato vive en el esquema (CLAUDE.md, «Restricciones aprendidas»).
  Aun así quedan consumidores que vuelven a normalizar valores que ya llegan canónicos:
  - `tipo` con `trim().toLowerCase()`: `src/lib/calc/resultados.ts:70` y
    `src/modules/estado-resultados/selectores.ts:294` y `:299`.
  - `comision_base` con `trim()`: `src/lib/calc/venta.ts:49`.
  - `categoria` y `subcategoria` con `trim()`: `selectores.ts:385-386`.

  Hoy no producen ningún error. El riesgo es otro: mientras exista normalización fuera del
  esquema, alguien puede creer que ahí es donde va y reintroducir la divergencia que costó
  cuatro parches. Quitarlas es lo que convierte la restricción en algo que el código sostiene,
  y no solo el documento. Toca el motor, así que va con sus pruebas y sin mover cifras.
- **Avisar de importes negativos en `precio_venta` y `costo_unitario`.** Decidido el
  2026-09-14: no son decisiones de negocio válidas, sino errores de captura o de signo. Hoy se
  aceptan sin aviso: «-500» se lee como −$500. Los importes negativos de `cobranza.monto` se
  quedan sin aviso a propósito, porque pueden ser notas de crédito. La severidad se decide al
  implementarlo, con el criterio de consecuencia (`docs/decisiones.md`, 2026-09-14).
- **Rediseño de la plantilla** con hojas como tablas de Excel, para eliminar las filas de relleno
  y el renglón de nota que el lector tiene que descartar. Hasta el 2026-10-10 este punto se
  llamaba «plantilla v2»; ese nombre es ahora de la plantilla de partidas de la v1.2.0
  (`docs/decisiones.md`, 2026-09-14), que conserva las hojas como están. Las fórmulas de las columnas calculadas
  (`utilidad_bruta`, `margen_pct`, `cobrado`, `saldo`) ya están en cada fila de captura desde la
  plantilla v2, a nivel de folio, con el rango `cobranza!$B$3:$B$1000`,
  y desaparecen con Google Sheets en v1.3 (ROADMAP.md §3).
  Ese rediseño hay que hacerlo igual, y es el momento de decidir con qué herramienta se genera la plantilla, que hoy se
  edita a mano (sección 7). Opciones evaluadas el 2026-09-13:
  1. **SheetJS más un inyector de XML** que agregue estilos, listas y paneles. No compensa hoy:
     cambia sincronizar `ENCABEZADOS` con un .xlsx por sincronizar `ENCABEZADOS`, una tabla de
     estilos y un inyector. Más piezas y el mismo riesgo de deriva.
  2. **ExcelJS como dependencia solo del generador.** Escribe la presentación de forma nativa,
     pero obliga a traducir el libro de SheetJS y es un cambio de stack que se discute antes.

  Al rehacerla se limpian también las cadenas huérfanas de `xl/sharedStrings.xml` que dejaron
  las ediciones a mano: los modelos de drones de la lista que se quitó y los textos que se
  sustituyeron con celdas `inlineStr`. No se borran antes. Renumerar las referencias de todas
  las hojas para quitar texto que nadie ve es riesgo sin beneficio, y es la misma clase de
  cirugía que dejó 1,297 filas sin cerrar.
- **Columnas fuera del contrato en las hojas de datos.** Verificado el 2026-09-14 ejecutándolo:
  una columna `descuento` con valores en `ventas` se descarta sin ningún hallazgo. El esquema
  la ignora y ninguna regla la mira. Falta avisar de toda columna con datos que no sea del
  contrato, con hoja y nombre.
- **`parametros` sin fila de encabezados.** Verificado ejecutándolo: si el cliente borra la
  fila `parametro | valor | nota`, el lector toma la primera fila de datos por encabezado y su
  valor se pierde en silencio. `provision_91_180` «30%» en la fila 1 aplicó 25% sin aviso.
- **Coherencia entre parámetros.** Verificado por lectura del código, no ejecutado:
  `periodo_fin` anterior a `periodo_inicio` no produce hallazgo. `diasDelPeriodo` devuelve
  null, así que el DSO queda sin calcular, y `periodoDelReporte` pinta el rango al revés.
- **El nombre propuesto del PDF no distingue el archivo de origen.** Observado el 2026-09-14 en la
  primera corrida de `/verificar todo`: `nombreArchivoReporte()` (`src/components/impresion.ts`)
  arma el nombre solo con el periodo y el corte. Dos archivos de origen distintos con el mismo
  periodo y el mismo corte proponen los dos `Reporte_2026-01-01-a-2026-12-31_2026-09-09`, y Chrome
  sobrescribe el primero sin avisar. Con multiempresa (v1.4) —dos clientes, mismo día— se vuelve
  un problema real. Falta decidir qué distingue el nombre.
- **El texto derecho del encabezado y del pie del PDF no tiene holgura.** Observado el
  2026-09-14: en las hojas de módulo, «Corte al 09/09/2026 · DEMO_Agrodrones_Bajio_FICTICIO.xlsx»
  termina a 0.1 pt del límite imprimible; re-medido con la v1.1.5, a 0.006 pt. Con un archivo
  de origen de nombre más largo no cabría.
  No está verificado qué pasa entonces.
- **Dos pruebas guardián pueden fallar por el disco y no por el código.** Observado el
  2026-09-14: «ningun otro archivo lo importa» (`src/dev/__tests__/fixtureDesarrollo.test.ts`) y
  «solo src/lib/preferencias menciona localStorage»
  (`src/lib/preferencias/__tests__/preferencias.test.ts`) recorren `src/` leyendo cada archivo de
  forma síncrona. En el repositorio tardan 0.2–0.3 s. En copias del proyecto bajo `%TEMP%`
  tardaron hasta 7.4 s y fallaron por el límite de 5 s de vitest («Test timed out in 5000ms»);
  con 60 s de límite pasaron, con la aserción cumplida. Es la peor clase de prueba frágil: su
  rojo no dice nada del código, y enseña a ignorar el rojo de las pruebas que sí cuidan algo.
- **Ningún error del panel de validación bloquea un módulo, y la especificación dice que sí.**
  Observado el 2026-10-10. No es solo un texto de la interfaz:
  - `CLAUDE.md`, «Validación», **define** Error como «bloquea el módulo afectado».
  - `docs/decisiones.md` razona la severidad sobre esa premisa: la entrada del 2026-09-14 sobre
    `parametros` dice que «Error» significa que bloquea el módulo afectado, y la del 2026-09-13
    sobre valores de lista descarta el error con el mismo criterio.
  - `src/components/PanelValidacion.tsx` lo afirma en su comentario (línea 23) y en pantalla:
    «N errores bloquean los módulos afectados» (170–171) y «Los errores bloquean únicamente el
    módulo afectado» (199).
  - `capacidades()` (`src/lib/schema.ts:317`) habilita cada módulo solo por si hay filas de
    ventas, cobranza, fechas de pago y gastos. Los hallazgos no entran. Verificado por lectura.
  - Lo que un error hace de verdad depende de la regla. Una fila que no cumple el esquema sale
    del dataset. Un folio repetido ni eso: ejecutado con datos inventados, las dos filas entran al
    motor y cada una resta todo lo cobrado del folio (`docs/decisiones.md`, 2026-09-14, versión
    de la 1.2.0). Qué hace cada una de las demás reglas de error no está revisado.
  - Antecedente: `comision_pct` ilegible pasó de error a advertencia en la 1.1.4 por esta misma
    razón, tratado como un caso y no como el patrón (`docs/notas-version.md`).

  **La pregunta que abre, sin decidir:** ¿se cambia el código para que un error bloquee su
  módulo, o la especificación para que deje de prometerlo? Cualquiera de las dos mueve cosas: la
  primera apaga módulos que hoy se muestran, la segunda obliga a revisar las dos decisiones que
  eligieron severidad con ese criterio. Va en su propia sesión.
- **El hallazgo «Cartera sin antigüedad determinable» puede omitir folios, y calla.** Observado
  el 2026-10-10 **leyendo el código, no ejecutándolo**. La regla `cartera-sin-fecha`
  (`src/lib/calc/insights.ts`) toma el monto del tramo «sin fecha» del aging, que desde la v1.2.0
  suma pendientes de partida, pero arma su lista de folios con `s.bucket === "sin-fecha"`, que es
  el tramo del **renglón** del folio: el de su pendiente más antiguo. Un folio con una partida
  fechada pendiente y otra sin fecha pendiente se resume en el tramo fechado, así que su importe
  entra al monto y su folio no aparece en la lista. El texto diría «$X de saldo… Folios: A, B» con
  un folio de menos, sin nada que lo delate. Debe leer `s.tramos`, como ya hace la regla de más de
  180 días. Con el demo no se manifiesta: su única partida sin fecha (V-025) está sola en su folio
  y pagada. Falta reproducirlo con datos armados y corregirlo, con su prueba. Toca el motor.
- **El aviso de medición mixta de Cobranza cita una columna que no existe.** Observado el
  2026-10-10. `TEXTO_BASE.mixta` (`src/modules/cobranza/selectores.ts`) termina con «La columna
  «base» lo indica fila por fila», y la tabla de saldos no tiene esa columna: el dato está en el
  motor (`base`), pero no se pinta. Es anterior a la v1.2.0. Falta decidir si se agrega la columna
  o se quita la frase.
- **La venta cruzada por folio no se muestra en ninguna pantalla.** El motor la calcula desde la
  v1.2.0 (`clientes.ventaCruzadaFolio`; con el demo, 2 de 13), pero ningún módulo la pinta ni hay
  hallazgo que la juzgue: su umbral y su texto siguen sin decidir (CLAUDE.md, «Partidas por
  folio»). Mientras tanto es una cifra calculada que nadie ve.
- **Tres avisos que piden un dato sin comprobar que haga falta.** Observado el 2026-10-10 al
  corregir el de días de crédito, que tenía ese defecto: avisaba de ventas de contado ya
  liquidadas. Los tres vistos **leyendo el código, no ejecutándolos**:
  - **«Falta fecha» en una partida Demo.** La regla `fila-sin-fecha` recorre todas las filas de
    `ventas`. Una Demo no entra al análisis mensual ni a la cartera, así que su fecha no hace
    falta, y el aviso dice que «la fila queda fuera del análisis mensual» de una fila que ya
    estaba fuera.
  - **«Días de crédito pactados» en el Alcance de la portada.** `alcanceDelReporte`
    (`src/modules/resumen/selectores.ts`) lo lista entre lo que el reporte no incluye cuando ninguna
    venta trae plazo, aunque ninguna tenga saldo. Es el mismo criterio que se acaba de corregir en
    el panel, escrito aparte en el papel.
  - **El aviso de días de crédito sin hoja `cobranza`. Es el peor de los tres.** Sin abonos, toda
    venta «debe» su precio completo, así que el aviso sale en todas: **el archivo más incompleto
    es el que más ruido genera**. Y mientras tanto el módulo de Cobranza está deshabilitado y no
    hay antigüedad que mostrar. Desde el 2026-10-11 la hoja ausente ya es una advertencia propia,
    que dice lo importante una vez; falta que este aviso calle cuando no hay cobranza.
- **El panel de validación debe mostrar la columna `notas` junto al hallazgo de su fila.**
  Propuesto y aprobado el 2026-10-11; va en su propia sesión, con recorrido visual. `notas` es una
  columna del contrato que el panel no lee. Quien sabe por qué una fila es rara lo anota una vez en
  su archivo, y el aviso deja de parecer un descuido cada vez que lo carga: el hallazgo se conserva
  y llega acompañado de la explicación de quien capturó. Resuelve además que las advertencias
  deliberadas del demo no parezcan defectos del archivo **sin ninguna rama que detecte «este es el
  demo»**, que es lo que no se quiere. El demo ya trae la nota en V-006 («Unidad demostrativa,
  excluida del analisis de venta») y en el abono de V-018 («Sobrecobro deliberado para prueba»);
  faltan la de V-025 (venta sin fecha) y la de la partida de V-015 que dice «Contado». Al editarlas,
  el LEEME del demo y su prueba (`demo.test.ts`) siguen valiendo.
- **Los informativos no deben contar en el encabezado del panel.** Propuesto y aprobado el
  2026-10-11; misma sesión que el anterior. Hoy «18 advertencias · 7 informativos» suma cosas que
  no son incidencias: «se descartó la fila de ejemplo» es la aplicación contando que leyó bien.
  Diseño acordado: **el encabezado cuenta solo errores y advertencias**; los informativos dejan de
  llamarse así y pasan a una sola línea tenue debajo —«Lectura del archivo: 274 filas vacías
  ignoradas, 3 filas de ejemplo descartadas, 1 fila Demo listada aparte»—, que se despliega para ver
  el detalle. Con un archivo correcto el encabezado dice «Sin incidencias» y la línea de lectura.
  No desaparecen: que la aplicación diga cuántas filas ignoró es lo que evita que alguien crea que
  perdió datos. El criterio es que quien carga un archivo correcto no sienta que algo está mal. La
  severidad de la hoja ausente ya se corrigió aparte, para que no quede en esa línea.
- **Una hoja presente pero sin filas deshabilita módulos sin ningún hallazgo.** Observado el
  2026-10-11 leyendo el código: `capacidades()` decide por número de filas, y `hoja-ausente` solo
  mira si la hoja existe. Un archivo con la hoja `cobranza` vacía apaga Cobranza y Flujo igual que
  uno sin la hoja, y el panel no dice nada; lo dice solo el módulo al abrirlo. No se sube a
  advertencia sin decidirlo: la plantilla recién descargada es exactamente ese caso, y hoy carga
  sin advertencias a propósito.
- **Los días de una partida que aún no vence se muestran en negativo.** Observado el 2026-10-10
  en Cobranza: un accesorio entregado el 20/08 con 90 días de crédito aparece con «-70» al corte del
  09/09. Es correcto —faltan 70 días para que venza— y los renglones de folio usan el mismo
  formato desde la v1.0, pero en la tabla de partidas se nota más, junto a un «65» de la partida
  vencida del mismo folio. Es decisión de presentación, no defecto: falta decidir si se dice de
  otro modo («vence en 70 días», una raya, otra columna).
- **AD-01 a AD-06 están en `ROADMAP.md` §4 y no en el registro de decisiones.** Observado el
  2026-10-10 al escribir la regla de la sección 9. Están en el repositorio, así que no corren el
  riesgo de la memoria perdida, pero quien busque una decisión en `docs/decisiones.md` no las
  encuentra. Falta migrarlas con su formato o referenciarlas desde el registro.
- Gastos por categoría en el motor, hoy solo agregados.
- Números de página en el PDF impreso.

**Funcionalidad**
- Módulo de inventario: existencias, rotación, días de inventario, capital inmovilizado.
- Histórico entre cortes: comparar mes contra mes, exige persistencia.
- Edición de filas provenientes del archivo, hoy solo se corrigen en el Excel.
- Balance simplificado: activos, pasivos, capital, aportaciones y retiros de socios.
- Multimoneda con tipo de cambio por transacción.

**Arquitectura**
- Persistencia con Supabase y autenticación, requisito de todo lo histórico.
- **Conexión a Odoo**, sustituyendo la carga de Excel. Es el destino del proyecto: el motor
  de cálculo ya está preparado y solo cambia la fuente. El transporte va aislado del negocio
  (ROADMAP.md, AD-02): un adaptador por protocolo detrás de una interfaz común, que soporte
  XML-RPC/JSON-RPC y el API JSON-2 según la versión del ERP del cliente. XML-RPC y JSON-RPC
  están programados para eliminarse en Odoo 22 y el JSON-2 es su reemplazo, así que habrá que
  convivir con ambos durante años.
- Web Worker para el parseo, si aparecen archivos grandes.

---

## 12. Riesgos conocidos

**El cliente modifica la plantilla.** Inserta columnas, renombra hojas, borra la fila de
ejemplo. Mitigación: validación que señala hoja y fila, y una prueba que compara
encabezados contra la plantilla real. No hay defensa perfecta.

**Dependencia de `xlsx` vía URL del CDN de SheetJS.** El paquete de npm está abandonado y
es vulnerable, así que se apunta al tarball oficial parcheado. Si ese CDN cae, el build de
Vercel falla. Plan de contingencia: migrar a ExcelJS, cambio aislado en `src/lib/parse/`.

**Calidad de los datos de origen.** La aplicación calcula correctamente sobre lo que
recibe. Si el costo viene derivado del precio en vez de la factura del proveedor, el
margen es falso aunque el cálculo sea perfecto. Por eso todo reporte lleva su sección de
limitaciones y supuestos. **Nunca se entrega un reporte sin ella.**

**Impresión dependiente del navegador.** `window.print()` se comporta distinto entre
Chrome, Firefox y Safari. Verificar en Chrome como mínimo antes de cada entrega al cliente.
