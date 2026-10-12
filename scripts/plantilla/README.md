# Guiones de la plantilla v2

**Esto no es un generador.** Es la herramienta con la que se escribieron la plantilla v2 y las
fórmulas del demo el 2026-10-10, guardada como registro de cómo se hizo y como punto de partida si
algún día hay que tocar una v3.

**La plantilla publicada es la que está en `docs/`, no la que estos guiones regeneren.** Ninguno
escribe sobre `docs/`: se niegan. Lo que produzcan va a otra ruta, se compara, se revisa, y solo
entonces una persona lo copia.

## Por qué no hay generador, y por qué esto no lo contradice

`GOBERNANZA.md` §7: la versión gratuita de SheetJS no escribe estilos de celda, listas desplegables
ni paneles fijos, y la hoja INSTRUCCIONES depende de esa presentación. Eso sigue siendo cierto.
Estos guiones no generan la plantilla desde el esquema: **editan el XML de la v1**, sustitución por
sustitución, conservando lo que ya traía. Es la edición a mano de §7, escrita para que se pueda
leer y repetir. Si el XML de partida no es exactamente el esperado, se detienen en vez de forzarlo.

## Qué hizo cada uno

| Guion | Qué hizo |
|---|---|
| `construir_v2.py` | Escribió las 13,366 celdas de las filas de captura de `ventas`, `cobranza` y `gastos` (antes cada fila traía solo la del folio), las fórmulas de `ventas`, `fullCalcOnLoad` en el libro y el texto nuevo de INSTRUCCIONES. Por etapas, para verificar hoja por hoja. |
| `comprobar_xml.mjs` | Lee cada parte XML de un .xlsx con un parser real y cuenta filas, celdas por fila, fórmulas y estilos. Es lo que se corrió después de cada etapa. |
| `evaluar_formulas.mjs` | Evalúa las fórmulas reales de la v2 con un motor de hoja de cálculo sobre datos inventados. Una segunda opinión; no es Excel. |
| `calcular_demo.mjs` y `aplicar_demo.py` | Calcularon y escribieron en el demo las fórmulas de `cobrado` y `saldo` a nivel de folio, con sus valores guardados (598 celdas). |
| `leeme_demo.py` | Agregó a la hoja LEEME del demo los avisos que el archivo produce a propósito, con su razón (8 renglones). |

Los dos que evalúan fórmulas necesitan `hyperformula`, que **no es dependencia del proyecto** y no
debe serlo: se instaló y se corrió en una carpeta temporal, fuera del repositorio.

## Cómo se usó

```
# Plantilla: una hoja a la vez, comprobando entre cada una
python3 scripts/plantilla/construir_v2.py --salida /tmp/v2.xlsx ventas
node scripts/plantilla/comprobar_xml.mjs /tmp/v2.xlsx ventas
python3 scripts/plantilla/construir_v2.py --salida /tmp/v2.xlsx ventas cobranza
...
python3 scripts/plantilla/construir_v2.py --salida /tmp/v2.xlsx      # todas las etapas
```

Después de cada etapa se corrieron además las pruebas de `src/lib/parse/__tests__/plantilla.test.ts`
contra el archivo: que un parser XML lea todas las partes sin error y que el lector de la aplicación
siga dando un dataset vacío.

El demo de partida para `calcular_demo.mjs` y `aplicar_demo.py` es el del commit `9b9bb02`.

## Lo que se comprobó, y lo que no

- Al guardarlos (2026-10-10), `construir_v2.py` reproduce byte a byte las partes XML de
  `docs/Plantilla_Captura_Reporteria_v2.xlsx`, y `aplicar_demo.py` reproduce el demo de `docs/`.
- **Eso deja de ser cierto en cuanto alguien edite la plantilla de `docs/`** por otro camino, o la
  abra y la guarde con una hoja de cálculo. Nada los mantiene sincronizados, a propósito: no son la
  fuente de la plantilla.
- No se corren sin leerlos. Parten de la v1 tal como está en `docs/`; contra otro archivo, o contra
  una v1 modificada, se detienen.
- Que la plantilla abra sin pedir reparación en Excel no lo comprueba ningún guion: lo valida una
  persona (CLAUDE.md, «Partidas por folio»).
