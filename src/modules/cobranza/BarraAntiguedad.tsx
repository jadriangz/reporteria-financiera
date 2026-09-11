import { BarraBuckets, type Segmento } from "../../components/ui/BarraBuckets";
import type { Cartera } from "../../lib/calc";
import { moneda, porcentaje } from "../../lib/format";
import {
  ESTILO_BUCKET,
  ETIQUETA_BUCKET,
  TEXTO_BASE,
  baseDeMedicion,
  bucketsVisibles,
} from "./selectores";

/**
 * Distribucion del saldo por antiguedad, con la aclaracion de contra que se
 * midio (fecha de venta o vencimiento pactado).
 *
 * La comparten Cobranza y el Resumen ejecutivo: la aclaracion de la base viaja
 * siempre con la barra, porque sin ella "200 dias" no se puede leer.
 */
export function BarraAntiguedad({ cartera }: { readonly cartera: Cartera }) {
  const segmentos: Segmento[] = bucketsVisibles(cartera).map((b) => ({
    clave: b,
    etiqueta: ETIQUETA_BUCKET[b],
    valor: cartera.aging.porBucket[b],
    texto: moneda(cartera.aging.porBucket[b]),
    estilo: ESTILO_BUCKET[b],
    participacion: porcentaje(cartera.aging.participacion[b], 0),
    nota: b === "sin-fecha" ? "Sin antigüedad determinable" : undefined,
  }));

  return (
    <>
      <BarraBuckets
        segmentos={segmentos}
        etiqueta="Distribución del saldo por antigüedad"
        vacio="No hay saldo pendiente: toda la venta está cobrada."
      />
      <p className="mt-3 border-l-2 border-slate-300 pl-2 text-[11px] leading-snug text-slate-600">
        {TEXTO_BASE[baseDeMedicion(cartera)]}
      </p>
    </>
  );
}
