---
description: Recorre la definición de terminado (GOBERNANZA.md §8) y la cadena del contrato de datos (§7) contra los cambios sin commitear, y reporta cada casilla
argument-hint: sin argumentos — revisa el working tree y el área de staged
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git show:*), Bash(git log:*), Bash(npm run test), Bash(npm run typecheck), Bash(npm run lint), Bash(npm run build), Read, Glob, Grep
---

# ¿Está terminado?

Lee `CLAUDE.md` y `GOBERNANZA.md`. Este comando audita la **sección 8** de GOBERNANZA.md —la
definición de terminado— y la **sección 7** —el contrato de datos— contra los cambios que aún no
tienen commit.

Estado:

- Árbol: !`git status --short --branch`
- Archivos con cambios: !`git diff --stat HEAD`

## Alcance

El working tree más lo que esté en staged. **Si el árbol está limpio**, dilo: no hay nada
pendiente por revisar. Ofrece entonces recorrer la sección 8 contra el último commit
(`git show HEAD`) y **espera**: no lo hagas por tu cuenta, porque auditar un commit ya hecho es
una pregunta distinta de auditar algo que está a punto de entrar.

## Cómo se reporta cada casilla

Cuatro veredictos, y hay que elegir el correcto:

- **cumple** — lo verificaste.
- **incumple** — falta algo que sí se puede y se debe hacer. Es un bloqueante.
- **pendiente humana** — algo que tú estructuralmente no puedes hacer, o una decisión que no te
  corresponde. **No es un incumplimiento** y no se cuenta como tal.
- **no aplica** — con la razón escrita. «No toca nada imprimible» es una razón; «no me pareció
  relevante» no.

Al final, dos listas separadas: **bloqueantes** y **pendientes humanas**. Nunca las mezcles: la
diferencia entre «está mal» y «te toca a ti» es justo lo que hace útil este comando.

---

## Las nueve casillas de la sección 8

### 1. `npm run test` en verde, con pruebas nuevas que cubren el cambio

Dos cosas, no una. Corre la suite, **y** revisa que el diff traiga pruebas que cubran lo que
cambió. Si toca `src/lib/calc/` o `src/modules/*/selectores.ts` y ningún `__tests__/` se movió,
es **incumple**: el motor sin prueba es exactamente lo que la sección 1 llama el activo más
valioso del proyecto, sin su red.

### 2. `npm run typecheck`, `npm run lint` y `npm run build` en verde

Córrelos. Reporta la salida de los que fallen.

### 3. Sin `any`, sin `@ts-ignore`, sin `localStorage`

Búscalo **en el diff**, no en el repositorio entero: lo que ya estaba no es asunto de este
cambio. Patrones que valen: `: any`, `as any`, `<any>`, `any[]`, `@ts-ignore`. Cuidado con los
falsos positivos de la palabra «any» dentro de cadenas, comentarios y nombres propios.

`localStorage` solo es legítimo en `src/lib/preferencias/`, y ya hay una prueba guardián que
recorre `src/` para impedir lo demás: cita su resultado en lugar de repetir el trabajo.

`@ts-expect-error` no está prohibido por `CLAUDE.md`, pero es el mismo olor: repórtalo como
**advertencia**, no como incumplimiento.

### 4. Verificado visualmente con el archivo de demostración y con uno real

Dos mitades con veredicto distinto:

- **Demo**: se delega a `/verificar`. Si no se corrió en esta sesión, es **pendiente humana**.
- **Archivo real**: **SIEMPRE pendiente humana. Nunca incumplimiento.** Ningún archivo con datos
  reales de un cliente entra al repositorio (GOBERNANZA.md sección 10), así que no puedes
  verificarlo ni debes intentarlo. Repórtalo como lo que es: algo que le toca a la persona, en su
  máquina, con su archivo. No lo cuentes entre los bloqueantes ni sugieras traer el archivo al
  repositorio para resolverlo.

### 5. Si toca algo imprimible, verificado en el PDF exportado

Decídelo desde el diff. Cuenta como imprimible: `src/components/VistaImpresion.tsx`,
`src/components/impresion.ts`, las reglas `@media print` de `src/index.css`, y el render de
cualquier módulo de `src/modules/`. Si aplica y no hay una corrida de `/verificar` con su Fase C,
es **pendiente humana**.

### 6. Las cifras de referencia siguen cuadrando

Las pruebas que lo afirman son `src/lib/calc/__tests__/motor.test.ts`, `insights.test.ts` y
`limites.test.ts`, sobre el fixture al corte `2026-09-09`. Di cuáles corrieron y con qué
resultado.

**Señal de alarma:** si el diff **edita** `src/lib/calc/__tests__/fixture.ts` o la tabla de
cifras de `CLAUDE.md`, márcalo en rojo y pide la justificación. GOBERNANZA.md sección 1: «las
cifras se verifican, no se ajustan. Nunca se modifica la cifra esperada para que pase la prueba».

### 7. `CLAUDE.md` actualizado si cambió una regla

Esto no es decidible mecánicamente y no lo decidas tú. Lo que sí puedes hacer es traer la
evidencia: si el diff toca `src/lib/calc/`, `src/lib/schema.ts`, los tokens de `src/index.css` o
la lista blanca de `src/lib/preferencias/`, y `CLAUDE.md` no está en el diff, repórtalo como
**pendiente humana** nombrando el archivo y la línea que te hizo preguntarlo.

### 8. Versión incrementada según la sección 3

Compara `package.json` contra `git show HEAD:package.json`. Clasifica el cambio desde el diff:

- **MAYOR** — nombres de campo en `schema.ts`, definiciones de cálculo, o cualquier cifra que el
  cliente ya vio en un reporte.
- **MENOR** — módulo nuevo, campo opcional nuevo, capacidad nueva compatible hacia atrás.
- **PARCHE** — defecto, ajuste visual, rendimiento.
- **Sin incremento** — cambios solo de documentación o de herramientas (`.claude/`, los `.md` de
  la raíz), y código exclusivo de desarrollo que no llega al bundle de producción. La sección 3
  versiona el contrato de datos y la confianza en las cifras; si ninguno se mueve, no hay nada
  que versionar.

Di el veredicto con la versión esperada exacta.

### 9. Decisión registrada si hubo alguna no obvia

Revisa si `docs/decisiones.md` está en el diff. Si no está y el cambio tomó alguna decisión con
alternativas razonables, pregúntalo: es **pendiente humana**, no incumplimiento.

`docs/contraste.md` en el diff **no cuenta como decisión**: lo regenera `npm run test`.

---

## Casilla adicional — la sección 7, el contrato de datos

**Se dispara solo si el diff toca `src/lib/schema.ts`.** Si no lo toca, es **no aplica**.

Si lo toca, esta casilla es **BLOQUEANTE, no advertencia**. La razón: una divergencia entre
`schema.ts` y la plantilla no rompe ninguna prueba y no se nota hasta que, meses después, un
número sale raro en el reporte de un cliente. Es el acoplamiento más frágil del proyecto.

Los seis pasos de la sección 7, y qué verificar en cada uno:

| Paso | Qué revisar | Si falta |
|---|---|---|
| 1. `schema.ts` | Es el disparador | — |
| 2. Editar la plantilla | **Pendiente humana, a propósito.** No hay generador: la versión gratuita de SheetJS no escribe estilos, listas desplegables ni paneles fijos, y la hoja INSTRUCCIONES depende de esa presentación («solo escriba en las celdas de letra azul»). La plantilla se edita a mano sobre su XML (GOBERNANZA.md §7). Pide confirmación explícita de que `docs/Plantilla_Captura_Reporteria_v1.xlsx` se actualizó conservando estilos, listas y paneles, y de que Excel de escritorio la abre sin pedir reparación. La cerca automática son las pruebas del paso 4 | pendiente humana |
| 3. Exportación a Excel | `ENCABEZADOS` en `src/lib/exportar/index.ts` se movió con el cambio, para que la ida y vuelta siga cerrando | **bloqueante** |
| 4. Prueba de encabezados | `src/lib/parse/__tests__/plantilla.test.ts` está en el diff **y pasa**: es la que compara `ENCABEZADOS` contra el .xlsx real | **bloqueante** |
| 5. `CLAUDE.md` | Está en el diff, con el contrato actualizado | **bloqueante** |
| 6. Versionar la plantilla | Si cambió el nombre de un campo: existe `_v2.xlsx` y está decidido si la app soporta ambas. Más el incremento de versión de la sección 3 | **bloqueante** |

Recuerda además la regla que acompaña a la sección 7: **nunca se rompe una plantilla que el
cliente ya tiene en sus manos.** Si el campo nuevo es obligatorio, su ausencia tiene que
aceptarse con advertencia durante al menos una versión. Si el diff la hace obligatoria de golpe,
repórtalo como bloqueante aunque los seis pasos estén.

---

## Cierre

**No declares «terminado».** Reporta el estado de cada casilla; declararlo es de la persona, y
el commit es el único punto de control real (GOBERNANZA.md sección 6).
