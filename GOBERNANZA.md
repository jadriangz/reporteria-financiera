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

**v1.0 — MVP funcional.** Seis módulos de reporte, carga de Excel/CSV, captura manual,
exportación a Excel, exportación a PDF por impresión del navegador, validación en tres
niveles de severidad.

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

La versión vive en `package.json` y se muestra en el pie de la aplicación y en el PDF
exportado. Un reporte sin versión no es auditable.

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

**Mensajes de commit** con prefijo convencional, en español, en imperativo:

```
feat: módulo de inventario con rotación y días de existencia
fix: la fecha de corte tomaba el día UTC en vez del día local
chore: actualiza oxlint a 1.83
docs: registra la decisión sobre escenarios de provisión
```

Un commit por unidad lógica de cambio. Un commit que toca el motor, la UI y la plantilla
a la vez es imposible de revertir sin daño colateral.

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
`docs/Plantilla_Captura_Reporteria_v1.xlsx` deben coincidir campo por campo. Si divergen,
la aplicación lee mal el archivo del cliente y nadie se entera hasta que un número sale
raro.

**Cambiar un campo obliga a seis pasos, en este orden:**

1. Actualizar `schema.ts`
2. Actualizar el generador de la plantilla y regenerar el archivo
3. Actualizar la exportación a Excel para que siga siendo ida y vuelta
4. Actualizar la prueba que compara encabezados contra la plantilla real
5. Actualizar `CLAUDE.md`
6. **Versionar la plantilla** (`_v2.xlsx`) y decidir si la app soporta ambas

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
- Regla `attach-rate-bajo`: no debe dispararse si el negocio no vende accesorios en
  absoluto. Mismo error que ya se corrigió en cartera: ausencia de línea ≠ attach bajo.
- Plantilla v2 con hojas como tablas de Excel, para eliminar las filas de relleno con
  fórmulas y el renglón de nota que el lector tiene que descartar.
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
- **Conexión a Odoo por XML-RPC**, sustituyendo la carga de Excel. Es el destino del
  proyecto: el motor de cálculo ya está preparado y solo cambia la fuente.
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
