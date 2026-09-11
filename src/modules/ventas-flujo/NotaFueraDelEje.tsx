import { Cifra } from "../../components/ui/primitivas";
import { entero, moneda } from "../../lib/format";
import type { FueraDelEje } from "./selectores";

/**
 * Lo que una grafica mensual no pudo dibujar por falta de fecha. Nunca se
 * omite en silencio.
 *
 * La comparten Ventas y flujo y el Resumen ejecutivo; `dondeVer` dice en que
 * parte del reporte esta el importe, porque el Resumen no tiene la tabla.
 */
export function NotaFueraDelEje({
  fuera,
  dondeVer = "la fila «Sin fecha» del detalle mensual",
}: {
  readonly fuera: FueraDelEje | null;
  readonly dondeVer?: string;
}) {
  if (fuera === null) return null;

  const facturado = fuera.facturado !== 0;
  const cobrado = fuera.cobrado !== 0;

  return (
    <p className="mt-2 border-l-2 border-advertencia pl-2 text-[11px] leading-snug text-slate-600">
      No aparecen en la gráfica{" "}
      {facturado && (
        <>
          <Cifra tono="advertencia">{moneda(fuera.facturado)}</Cifra> facturados sin fecha de venta
          ({entero(fuera.operaciones)} {fuera.operaciones === 1 ? "operación" : "operaciones"})
        </>
      )}
      {facturado && cobrado && " y "}
      {cobrado && (
        <>
          <Cifra tono="advertencia">{moneda(fuera.cobrado)}</Cifra> cobrados sin fecha de pago
        </>
      )}
      : no tienen mes al cual asignarse. Están en {dondeVer}.
    </p>
  );
}
