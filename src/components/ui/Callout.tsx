import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Recuadro de hallazgo, el equivalente de los cuadros del PDF de referencia.
 *
 * El texto lo redacta el motor (`insights.ts`), no la UI: aqui solo se decide
 * como se ve. El cuerpo va con `.cifras` porque los textos del motor traen
 * importes y porcentajes en prosa, y tambien esos se leen con numeros tabulares. Si un componente empieza a componer frases con cifras, esa logica
 * pertenece a las reglas declarativas, no a la pantalla.
 */

export type TonoCallout = "alerta" | "advertencia" | "oportunidad" | "nota";

const ESTILO: Readonly<
  Record<TonoCallout, { borde: string; fondo: string; titulo: string; marca: string; icono: string }>
> = {
  alerta: {
    borde: "border-riesgo/40",
    fondo: "bg-red-50",
    titulo: "text-riesgo",
    marca: "bg-riesgo",
    icono: "!",
  },
  advertencia: {
    borde: "border-advertencia/40",
    fondo: "bg-amber-50",
    titulo: "text-advertencia",
    marca: "bg-advertencia",
    icono: "!",
  },
  oportunidad: {
    borde: "border-positivo/40",
    fondo: "bg-emerald-50",
    titulo: "text-positivo",
    marca: "bg-positivo",
    icono: "+",
  },
  nota: {
    borde: "border-slate-300",
    fondo: "bg-slate-50",
    titulo: "text-marino",
    marca: "bg-marino",
    icono: "i",
  },
};

export function Callout({
  titulo,
  tono = "nota",
  children,
  pie,
}: {
  readonly titulo: string;
  readonly tono?: TonoCallout;
  readonly children: ReactNode;
  /** Linea al pie, p. ej. los folios o clientes implicados. */
  readonly pie?: ReactNode;
}) {
  const e = ESTILO[tono];

  return (
    <div className={clsx("imp-bloque flex gap-2 border-l-4 px-3 py-2", e.borde, e.fondo)}>
      <span
        aria-hidden="true"
        className={clsx(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
          e.marca,
        )}
      >
        {e.icono}
      </span>
      <div className="min-w-0">
        <p className={clsx("text-xs font-semibold", e.titulo)}>{titulo}</p>
        <div className="cifras mt-0.5 text-xs leading-snug text-slate-700">{children}</div>
        {pie !== undefined && <p className="cifras mt-1 text-[11px] text-slate-500">{pie}</p>}
      </div>
    </div>
  );
}

/** Mensaje de estado vacio en positivo: no hay nada que reportar y esta bien. */
export function TodoEnOrden({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="imp-bloque border border-positivo/30 bg-emerald-50 px-3 py-6 text-center">
      <p className="text-sm font-medium text-positivo">{titulo}</p>
      {children !== undefined && (
        <div className="cifras mt-1 text-xs text-slate-600">{children}</div>
      )}
    </div>
  );
}
