# Línea base del PDF exportado

Qué debe salir al imprimir el **reporte completo**, para poder detectar cuándo un cambio lo
altera sin que nadie lo haya pedido.

`/verificar` compara el PDF que genera contra este archivo en su Fase C. Es el reemplazo del
«PDF de referencia de 11 páginas» que `CLAUDE.md` citaba y que nunca estuvo en el repositorio:
un manifiesto se revisa en un diff, un binario no.

**Esto no se edita para que una corrida pase.** Si el PDF cambió a propósito, se actualiza este
archivo **y** se registra la decisión en `docs/decisiones.md`. Si cambió sin que nadie lo
pidiera, el cambio está mal (GOBERNANZA.md, sección 1: las cifras se verifican, no se ajustan).

## La corrida canónica

| | |
|---|---|
| Archivo | `docs/DEMO_Agrodrones_Bajio_FICTICIO.xlsx` |
| Fecha de corte | **2026-09-09**, fija y obligatoria |
| Modo | Reporte completo (`solicitarImpresion("completo")`) |
| Tema en pantalla | **Oscuro**, a propósito: es lo que prueba que el papel sale en claro |
| Navegador | Chrome (GOBERNANZA.md, sección 12: verificar en Chrome como mínimo) |
| Diálogo de impresión | «Guardar como PDF», tamaño Carta, **«Encabezados y pies de página» desactivado**. Ver «Opciones del diálogo de impresión» |

Con «hoy» en vez del corte fijo, el aging cambia cada día y la comparación no significa nada.

## Estructura esperada

El orden lo define `ORDEN_REPORTE` en `src/components/impresion.ts`, y **no es el de la
navegación**: en papel Cobranza va antes de Ventas y flujo, porque el saldo explica el flujo y
no al revés.

### 1. Portada

Solo existe en el reporte completo. Debe traer, en este orden:

- Filete azul marino superior y el nombre del cliente tomado de `parametros.nombre_cliente`
- Título «Reporte financiero y operativo»
- La leyenda de documento preliminar
- Ficha de datos: Cliente · Periodo · Fecha de corte · Archivo de origen · **Versión del
  generador**. Un reporte sin versión no es auditable (GOBERNANZA.md, sección 3)
- Bloque **Alcance**, que es la sección de limitaciones y supuestos. GOBERNANZA.md, sección 12:
  nunca se entrega un reporte sin ella. Si falta, es regresión, no detalle
- Dentro del Alcance, la lista **«Parámetros que no se pudieron leer»**, solo cuando algún
  parámetro capturado no se pudo leer y el usuario no lo ajustó desde la interfaz. Cada renglón
  dice qué se capturó y qué valor se aplicó en su lugar. Es lo único que le dice a quien recibe
  el papel con qué tasa se calculó, porque el panel de validación no viaja con el documento. Si
  el periodo es uno de ellos, su aviso aparece además en la ficha, bajo «Periodo».
  **Con el demo no debe aparecer**: sus parámetros están bien escritos. Si aparece, algo dejó de
  leerlos
- Nota de IVA, cuando el hallazgo `importes-iva` se dispara; si un parámetro de IVA no se pudo
  leer, lleva su aviso debajo

### 2. Una página por módulo

Cada una con su encabezado —título, fecha de corte y archivo de origen— y salto de página antes.

| # | Módulo | Orientación |
|---|---|---|
| 1 | Resumen ejecutivo | vertical |
| 2 | Estado de resultados | **apaisada** (`apaisada={id === "resultados"}`) |
| 3 | Cobranza | vertical |
| 4 | Ventas y flujo | vertical |
| 5 | Rendimiento por producto | vertical |
| 6 | Clientes | vertical |

### 3. Página «Módulos no incluidos»

**Con este archivo NO debe aparecer.** El demo habilita los seis módulos —todo abono trae
`fecha_pago`, lo afirma `src/lib/parse/__tests__/demo.test.ts`—, así que `plan.omitidos` queda
vacío. Si aparece, algo dejó de habilitarse y hay que averiguar qué antes de seguir.

## Invariantes del papel

Ninguna depende de las cifras; todas son regresiones si se rompen.

- **Sale en claro aunque la pantalla esté en oscuro.** El tema oscuro solo existe bajo
  `@media screen`, así que en papel no hay nada oscuro que ganar; `VistaImpresion` marca su raíz
  con el tema de impresión y `@media print` fija los valores claros.
- **La hoja completa sale en claro, márgenes incluidos.** No basta con que el contenido salga
  claro: el margen también es papel, y es lo primero que ve quien recibe el documento.
  **Cumplido desde v1.1.5**, verificado en el papel el 2026-09-14: los dos PDF de la corrida,
  impresos con la pantalla en oscuro, tienen cero rellenos `#121212` de hoja completa en sus 15
  hojas. En la corrida anterior, con la 1.1.4, las 15 hojas salieron pintadas de `#121212` con un
  rectángulo blanco solo bajo el contenido. Con el tema claro no pasaba.
- **Ningún borde queda fuera del área imprimible.** Desde v1.1.5 el área impresa mide 726 px
  (966 apaisada) y termina en 578.25 pt (758.25): ningún borde gris la pasa. Hasta la 1.1.4 los
  marcos quedaban hasta 0.69 px fuera y se veían abiertos a la derecha.
- **Los rótulos de la gráfica de modelos salen completos.** Desde v1.1.5, en la hoja de
  Rendimiento por producto los 12 rótulos van girados, sin abreviar y dentro del recorte de la
  gráfica: el más bajo, «Curso piloto certificado», apoya su línea base a 705.6 pt contra un
  recorte en 709.5. Hasta la 1.1.4 tres salían cortados por abajo.
- **Las gráficas también salen claras**: ejes, rejilla, rótulos y tooltip toman los tokens del
  contexto donde se pintan, no los del `<html>`.
- **Ninguna regla responsiva alcanza al papel**: la impresión es un contexto de ancho fijo y el
  layout es el de escritorio.
- **La gráfica de categorías no recorta al imprimir**, a diferencia de la pantalla estrecha.
- **Números tabulares** en todas las columnas de importes; sin eso no alinean.
- El nombre que el navegador propone es `Reporte_<inicio>-a-<fin>_2026-09-09`, sin extensión
  —la agrega el diálogo—, de `nombreArchivoReporte()`.

**Nota sobre cómo se verificaba «sale en claro».** Desde v1.1 se daba por verificado porque se
comprobó leyendo `data-tema` y los tokens del contenido, no mirando la hoja impresa. Por eso nadie
vio los márgenes oscuros hasta que la primera corrida de `/verificar` abrió el PDF. **Un invariante
que solo se verifica por código puede estar incumplido sin que nadie lo note.** Leer el código
explica por qué debería cumplirse; que se cumple lo dice el papel.

## Cifras que deben aparecer en el papel

En pesos, excluyendo la fila Demo (V-006), al corte 2026-09-09. La fuente es
`src/lib/calc/__tests__/fixture.ts` y la copia legible está en `CLAUDE.md`; aquí van solo las
que se leen a simple vista en el PDF.

```
operaciones             =        24
venta_total             = 4_496_900
utilidad_bruta          = 1_218_900
margen                  =    0.2711
cobrado                 = 2_541_100
saldo                   = 1_955_800
resultado_operativo     =    71_850
aging["0-30"]           =   683_000
aging["31-60"]          =    94_800
aging["61-90"]          =   390_000
aging["91-180"]         =   118_000
aging["+180"]           =   670_000
attach_rate             =      0.30
```

Si el PDF muestra costo 3_573_000 o cobrado 2_836_100, el motor dejó de excluir la fila Demo.

## Por confirmar en la primera corrida

Lo que no se puede derivar del código y hay que anotar viendo el PDF real. Hasta que estén
llenos, `/verificar` compara estructura e invariantes, no paginación.

Llenado con la primera corrida de `/verificar todo`, el 2026-09-14: demo limpio, Chrome 152
(«Skia/PDF m152» en el productor del PDF), tamaño Carta. Esa corrida se guardó **con «Encabezados
y pies de página» activado**. Que desactivarlo no mueva los saltos de página **no está
verificado**: la casilla escribe en el margen y no en el área de contenido, pero no se ha
comparado.

**Segunda corrida, 2026-09-14, con la v1.1.5.** Dos PDF guardados a mano con la pantalla en
oscuro y el corte fijo: el demo limpio y la copia con `provision_91_180` ilegible. **La paginación
no se movió**: 15 hojas con el mismo reparto por módulo en los dos, y las mismas tres tablas
continúan repitiendo su encabezado, aunque la gráfica de modelos creció para alojar sus rótulos.
**La pregunta de la casilla sigue sin respuesta**: se pidió desactivarla en los dos, y en el
segundo la persona comprobó en la vista previa que estaba desmarcada, pero **los dos PDF salieron
con encabezados y pies del navegador** en las 15 hojas —fecha de impresión, título,
`localhost:5173/?fixture=demo` y «n/15»—. Comparar los dos compara casilla activada contra casilla
activada. Cerrarla exige un PDF que de verdad salga sin ellos, comprobado en el PDF.

- [x] **Total de páginas** del reporte completo: **15**. Vertical, 612 × 792 pt, salvo las
  cuatro del Estado de resultados, apaisadas a 792 × 612 pt.
- [x] Dónde cae cada salto de página, y si algún módulo parte una tabla a media fila:

  | Hojas | Módulo |
  |---|---|
  | 1 | Portada |
  | 2–3 | Resumen ejecutivo |
  | 4–7 | Estado de resultados, apaisado |
  | 8–10 | Cobranza |
  | 11–12 | Ventas y flujo |
  | 13 | Rendimiento por producto |
  | 14–15 | Clientes |

  El orden coincide con el de este manifiesto y no aparece «Módulos no incluidos». **Ninguna
  tabla se parte a media fila.** Tres continúan en la hoja siguiente **repitiendo su
  encabezado**: Gastos operativos, Saldos pendientes y Concentración de clientes.
- [x] Si el Estado de resultados apaisado entra en una sola hoja: **no, ocupa cuatro** (4–7),
  todas del mismo módulo.
- [x] Nombre exacto del archivo propuesto, con el periodo real del demo:
  **`Reporte_2026-01-01-a-2026-12-31_2026-09-09`**. El diálogo agrega `.pdf`, y es también el
  `/Title` del documento.
- [x] Notas por módulo: qué tabla o gráfica queda cerca del borde:
  - **Todas las hojas de módulo**: el texto derecho del encabezado («Corte al 09/09/2026 ·
    DEMO_Agrodrones_Bajio_FICTICIO.xlsx») termina a **0.006 pt** del límite imprimible, medido
    con la v1.1.5 sumando los anchos de glifo (con la 1.1.4 eran 0.1 pt). Un archivo de origen
    con nombre más largo no tendría holgura (GOBERNANZA.md, sección 11).
  - **Rendimiento por producto (hoja 13)**: la gráfica muestra las 12 categorías sin recortar.
    **Es lo esperado en papel** (ver «Invariantes del papel»).
  - Los tres defectos que esta nota registraba con la 1.1.4 —marcos abiertos a la derecha, tres
    rótulos cortados en la hoja 13 y márgenes oscuros— están corregidos en la v1.1.5 y
    verificados en el papel. Ahora son invariantes (ver «Invariantes del papel»).
- [x] **El aviso de un parámetro ilegible en el Alcance de la portada impresa**: **verificado
  el 2026-09-14** con la v1.1.5, en un PDF de una copia del demo con `provision_91_180` escrito
  «treinta por ciento». La portada trae, dentro del Alcance, «Parámetros que no se pudieron
  leer», «El reporte se calculó con el valor indicado, no con el capturado.» y el renglón
  «provision_91_180 dice «treinta por ciento», que no se pudo leer: se aplica 25% (valor por
  omisión)». La ficha dice «Archivo de origen: DEMO_provision_ilegible.xlsx». Es donde importa,
  porque el panel de validación no viaja con el documento.

## Opciones del diálogo de impresión

Chrome ofrece en «Más ajustes» la casilla **«Encabezados y pies de página»**. Activada, imprime en
el margen de cada hoja la fecha y hora de impresión en el formato del navegador, el título —el
nombre del archivo—, la dirección de la aplicación y el número de hoja. En la corrida del
2026-09-14 salieron «9/14/26, 2:05 AM», `localhost:5174/?fixture=demo` y «4/15».

**Recomendación al usuario: desactivarla** al guardar un reporte. La ayuda junto al botón
«Descargar PDF» lo dice.

- **La dirección de la aplicación no tiene nada que hacer en el reporte de un cliente.** Es peor
  que perder el número de hoja.
- **La fecha de impresión compite con la fecha de corte**, y en el formato del navegador puede
  salir con el mes primero: la confusión `dd/mm` contra `mm/dd` que el parser evita.
- El reporte ya se identifica solo: cada hoja de módulo trae arriba su título, el corte y el
  archivo de origen, y abajo «Reporte preliminar · Confidencial · versión».

**Lo que se pierde es el número de hoja**, que el reporte todavía no imprime (ver «Deuda
conocida»). Es el costo aceptado mientras esa deuda siga abierta. La decisión está en
`docs/decisiones.md` (2026-09-14).

## Deuda conocida

Los números de página no se imprimen. Está en el backlog v2 de GOBERNANZA.md, sección 11. Hasta
que la aplicación los imprima, lo único que numera las hojas es la casilla del navegador que se
recomienda desactivar.
