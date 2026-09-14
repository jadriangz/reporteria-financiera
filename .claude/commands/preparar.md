---
description: Resume los cambios por módulo, confirma que el motor de cálculo está intacto, verifica el incremento de versión (GOBERNANZA.md §3) y propone el mensaje de commit. No hace commit.
argument-hint: sin argumentos — prepara el punto de control humano sobre los cambios sin commitear
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git show:*), Bash(git log:*), Bash(git tag:*), Read, Glob, Grep
---

# Preparar el punto de control

Lee `CLAUDE.md` y `GOBERNANZA.md`. Este comando deja listo lo que una persona necesita para
decidir si commitea, **sin commitear**.

Estado:

- Árbol: !`git status --short --branch`
- Resumen: !`git diff --stat HEAD`
- Versión en `package.json`: !`node -e "console.log(require('./package.json').version)"`
- Último tag: !`git describe --tags --abbrev=0`

## Lo primero: este comando NO commitea

No `git add`. No `git commit`. No crear rama. No `git push`.

El commit lo hace una persona después de leer este resumen, y es el único punto de control real
del proyecto (GOBERNANZA.md sección 6). Si el resumen que produces es bueno, esa lectura toma un
minuto; si empujas el commit tú, el control desaparece.

---

## 1. Resumen de cambios agrupados por módulo

Agrupa los archivos del diff en estas cubetas y, por cada una, di los archivos, las líneas
añadidas y eliminadas, y **una frase de qué cambió** —no un listado de nombres de función, sino
qué hace distinto la aplicación—:

| Cubeta | Rutas |
|---|---|
| **Motor de cálculo** | `src/lib/calc/` |
| **Contrato de datos** | `src/lib/schema.ts`, `docs/Plantilla_Captura_Reporteria_v1.xlsx` |
| **Parseo y validación** | `src/lib/parse/` |
| **Tema** | `src/lib/tema/`, `src/index.css`, `src/components/SelectorTema.tsx`, `src/store/useTema.ts` |
| **Preferencias** | `src/lib/preferencias/` |
| **Módulos de reporte** | `src/modules/<nombre>/` — uno por uno, con su número y título |
| **Componentes compartidos** | `src/components/`, `src/components/ui/` |
| **Captura y exportación** | `src/lib/captura/`, `src/lib/exportar/`, `src/components/captura/` |
| **Estado** | `src/store/` |
| **Desarrollo** | `src/dev/` |
| **Documentación** | `CLAUDE.md`, `GOBERNANZA.md`, `README.md`, `ROADMAP.md`, `docs/*.md` |
| **Herramientas** | `.claude/`, configuración, `package.json` |

Una cubeta vacía no se menciona. Si un archivo no encaja en ninguna, dilo aparte en lugar de
forzarlo.

## 2. ¿Está intacto el motor de cálculo?

`git diff --stat -- src/lib/calc`

**Si está vacío:** dilo en una línea, «motor intacto», y sigue.

**Si no está vacío:** no es una falla —el motor evoluciona—, pero es lo más delicado que hay en
el repositorio y va reportado arriba, antes que todo lo demás, con:

- qué archivos se movieron;
- si sus pruebas se movieron también;
- si se movió `src/lib/calc/__tests__/fixture.ts` o la tabla de cifras de `CLAUDE.md`, que es
  señal de que alguien ajustó la cifra esperada en vez de arreglar el código (sección 1);
- la implicación de versionado: una definición de cálculo que altera cifras ya reportadas es
  **MAYOR**, aunque técnicamente sea un arreglo de una línea.

Y verifica, sobre el diff, las invariantes de pureza que declara `CLAUDE.md`. En `src/lib/calc/`
no debe haber aparecido:

- `new Date(` — el motor nunca lee el reloj; si lo hiciera, el mismo archivo daría un aging
  distinto cada día y las pruebas del fixture caducarían solas;
- ningún import de React, ningún `fetch`, ningún efecto secundario;
- ningún valor por omisión para `fecha_corte`: es obligatorio en `OpcionesCartera` y
  `OpcionesInsights`, y el default de «hoy» vive en la UI.

## 3. ¿Está bien el incremento de versión?

Compara `package.json` contra `git show HEAD:package.json` y contra el último tag. Clasifica el
cambio según la sección 3:

- **MAYOR** — rompe el contrato de datos, o cambia una definición de cálculo que altera cifras ya
  reportadas. La regla crítica: si el socio vio una cifra el mes pasado y hoy la app dice otra,
  eso necesita un número de versión que lo justifique.
- **MENOR** — módulo nuevo, campo opcional nuevo, capacidad nueva compatible hacia atrás.
- **PARCHE** — corrección de defecto, ajuste visual, rendimiento, sin cambio de contrato ni de
  cifras.
- **Sin incremento** — cambios solo de documentación o de herramientas (`.claude/`, los `.md` de
  la raíz), y código exclusivo de desarrollo que no llega al bundle de producción. La sección 3
  versiona el contrato de datos y la confianza en las cifras: si ninguno se mueve, no hay nada
  que versionar, y forzar un incremento solo ensucia el historial.

Veredicto explícito: **correcto**, **falta incrementar** o **incremento insuficiente**, siempre
con la versión esperada exacta. Recuerda que la versión se muestra en el pie de la aplicación y
en el PDF: un reporte sin versión no es auditable.

## 4. Propuesta de mensaje de commit

Prefijo convencional, **en español, en imperativo**, como los ejemplos de la sección 4:

```
feat: módulo de inventario con rotación y días de existencia
fix: la fecha de corte tomaba el día UTC en vez del día local
chore: actualiza oxlint a 1.83
docs: registra la decisión sobre escenarios de provisión
```

Forma: asunto de unos 72 caracteres, sin punto final, minúscula después de los dos puntos.
Cuerpo solo si hace falta explicar el **por qué** —el qué ya está en el diff—. Sin líneas de
atribución: los commits de este repositorio son solo asunto y así se quedan.

**Y lo más importante de este paso: un commit por unidad lógica de cambio.** La sección 4 lo dice
sin matices: un commit que toca el motor, la UI y la plantilla a la vez es imposible de revertir
sin daño colateral. Si el diff abarca varias unidades, **propón varios commits**, cada uno con su
mensaje y su lista de archivos, en el orden en que deben entrar. No entregues un mensaje único
para un cambio que son tres.

Propón también el nombre de rama —`feat/<nombre>`, `fix/<nombre>` o `chore/<nombre>`—, porque
`main` no recibe commits directos una vez que el cliente tiene la URL, y cada rama abre un pull
request con su URL de preview.

---

## Cierre

Termina recordando, en una línea, que no commiteaste nada y que los comandos quedan a mano por si
el usuario quiere correr `/terminado` antes de decidir.
