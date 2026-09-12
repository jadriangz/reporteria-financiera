import { TablaCifras } from "../../components/ui/TablaCifras";
import type { ColumnaTabla } from "../../components/ui/tabla";
import type { Cascada } from "../../lib/calc";
import { moneda, porcentaje } from "../../lib/format";
import { type FilaCascada, construirCascada } from "./selectores";

const COLUMNAS_CASCADA: readonly ColumnaTabla<FilaCascada>[] = [
  { clave: "concepto", encabezado: "Concepto", celda: (f) => f.concepto },
  {
    clave: "importe",
    encabezado: "Importe",
    alineacion: "derecha",
    celda: (f) => moneda(f.importe),
    ancho: "9rem",
  },
  {
    clave: "pct",
    encabezado: "% sobre venta",
    alineacion: "derecha",
    titulo: "Proporción de la venta del periodo. Las deducciones se expresan en positivo.",
    celda: (f) => porcentaje(f.pctVenta),
    ancho: "7rem",
  },
];

/**
 * La cascada venta -> resultado del periodo.
 *
 * La comparten Estado de resultados y el Resumen ejecutivo: una sola tabla
 * para que las dos pantallas no puedan contar la cascada distinto.
 */
export function TablaCascada({ cascada }: { readonly cascada: Cascada }) {
  return (
    <TablaCifras
      etiquetaTabla="Estado de resultados del periodo"
      // Tabla de RESUMEN: cada renglon es un concepto que se lee solo, no una
      // operacion que se compare con la de al lado. En poco ancho cada concepto
      // se vuelve una tarjeta etiqueta/valor sin perder nada.
      enEstrecho="tarjetas"
      columnas={COLUMNAS_CASCADA}
      filas={construirCascada(cascada).map((f) => ({
        id: f.clave,
        datos: f,
        enfasis: f.enfasis,
        tono: f.tono,
      }))}
    />
  );
}
