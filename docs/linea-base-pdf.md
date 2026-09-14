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

- **Sale en claro aunque la pantalla esté en oscuro.** `VistaImpresion` marca su raíz con el
  tema de impresión y `@media print` fuerza los tokens claros.
- **Las gráficas también salen claras**: ejes, rejilla, rótulos y tooltip toman los tokens del
  contexto donde se pintan, no los del `<html>`.
- **Ninguna regla responsiva alcanza al papel**: la impresión es un contexto de ancho fijo y el
  layout es el de escritorio.
- **La gráfica de categorías no recorta al imprimir**, a diferencia de la pantalla estrecha.
- **Números tabulares** en todas las columnas de importes; sin eso no alinean.
- El nombre que el navegador propone es `Reporte_<inicio>-a-<fin>_2026-09-09`, sin extensión
  —la agrega el diálogo—, de `nombreArchivoReporte()`.

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

- [ ] **Total de páginas** del reporte completo
- [ ] Dónde cae cada salto de página, y si algún módulo parte una tabla a media fila
- [ ] Si el Estado de resultados apaisado entra en una sola hoja
- [ ] Nombre exacto del archivo propuesto, con el periodo real del demo
- [ ] Notas por módulo: qué tabla o gráfica queda cerca del borde

## Deuda conocida

Los números de página no se imprimen. Está en el backlog v2 de GOBERNANZA.md, sección 11.
