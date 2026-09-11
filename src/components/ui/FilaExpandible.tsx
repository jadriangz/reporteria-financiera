import clsx from "clsx";
import { type ReactNode, useId, useState } from "react";

import type { Tono } from "./primitivas";
import { useImprimiendo } from "./contextoImpresion";
import { type Enfasis, TONO_FILA } from "./tabla";

/**
 * Fila de tabla que despliega un detalle debajo.
 *
 * Vive aparte de `TablaCifras` porque el patron se repite fuera de ella: un
 * cliente que abre sus operaciones, un gasto que abre su desglose. La usa
 * `TablaCifras` internamente y tambien puede usarse suelta dentro de cualquier
 * `<tbody>`.
 *
 * Es `<tr>` por naturaleza: un detalle que se despliega dentro de una tabla
 * tiene que ser una fila, o rompe la alineacion de columnas, que es justo lo
 * que hace legible el reporte.
 */
export function FilaExpandible({
  celdas,
  detalle,
  columnas,
  tono = "neutro",
  enfasis = "normal",
  etiquetaDetalle = "Ver detalle",
  abiertaInicial = false,
  abierta: abiertaControlada,
  onAlternar,
}: {
  /** Las celdas `<td>` de la fila, sin incluir la del control. */
  readonly celdas: ReactNode;
  /** Contenido desplegable. `null` deja la fila sin control de apertura. */
  readonly detalle: ReactNode | null;
  /** Cuantas columnas ocupa el detalle, sin contar la del control. */
  readonly columnas: number;
  readonly tono?: Tono;
  readonly enfasis?: Enfasis;
  readonly etiquetaDetalle?: string;
  readonly abiertaInicial?: boolean;
  /** Si se pasa, la apertura la controla el padre. */
  readonly abierta?: boolean;
  readonly onAlternar?: () => void;
}) {
  const [abiertaLocal, setAbiertaLocal] = useState(abiertaInicial);
  const idDetalle = useId();

  // Imprimiendo se abre siempre: el detalle escondido no existe en papel.
  const imprimiendo = useImprimiendo();
  const abierta = imprimiendo || (abiertaControlada ?? abiertaLocal);
  const alternar = onAlternar ?? (() => setAbiertaLocal((v) => !v));

  return (
    <>
      <tr
        className={clsx(
          "border-b border-slate-100",
          // Impresa, la fila no se separa de su detalle.
          abierta && detalle !== null && "imp-con-detalle",
          TONO_FILA[tono],
          enfasis === "total" && "font-semibold",
          enfasis === "subtotal" && "font-medium",
        )}
      >
        <td className="align-top">
          {detalle === null || imprimiendo ? null : (
            <button
              type="button"
              onClick={alternar}
              aria-expanded={abierta}
              aria-controls={idDetalle}
              className={clsx(
                "flex h-full w-6 items-center justify-center text-slate-400",
                "hover:text-marino focus-visible:outline focus-visible:outline-2",
                "focus-visible:-outline-offset-2 focus-visible:outline-marino",
              )}
            >
              <span aria-hidden="true">{abierta ? "▾" : "▸"}</span>
              <span className="sr-only">{etiquetaDetalle}</span>
            </button>
          )}
        </td>
        {celdas}
      </tr>

      {abierta && detalle !== null && (
        <tr className="border-b border-slate-200 bg-slate-50/80">
          <td id={idDetalle} colSpan={columnas + 1} className="px-3 py-2">
            {detalle}
          </td>
        </tr>
      )}
    </>
  );
}
