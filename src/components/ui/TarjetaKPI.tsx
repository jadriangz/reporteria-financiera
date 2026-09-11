import clsx from "clsx";
import type { ReactNode } from "react";

import { SIN_DATO } from "../../lib/format";
import type { Tono } from "./primitivas";

/**
 * Tarjeta de indicador. Densidad alta: etiqueta pequena arriba, cifra grande, y
 * una nota al pie que explica el numero o dice por que falta.
 *
 * Generica a proposito: no sabe que es un saldo ni un DSO. Recibe el valor YA
 * formateado por `src/lib/format/`.
 */
export function TarjetaKPI({
  etiqueta,
  valor,
  tono = "neutro",
  nota,
  children,
}: {
  etiqueta: string;
  /** Valor ya formateado. `null` se pinta como raya, nunca como "0". */
  valor: string | null;
  tono?: Tono;
  /** Aclaracion al pie: la base del calculo, o que falta para poder calcularlo. */
  nota?: ReactNode;
  /** Contenido extra bajo la cifra, como una barra o una variacion. */
  children?: ReactNode;
}) {
  const ausente = valor === null || valor === SIN_DATO;

  return (
    <div className="imp-bloque flex min-w-0 flex-col border border-slate-200 bg-white px-3 py-2">
      <span className="text-[11px] leading-tight text-slate-500">{etiqueta}</span>
      <span
        className={clsx(
          "cifras mt-0.5 text-xl font-semibold leading-tight tabular-nums",
          ausente
            ? "text-slate-300"
            : {
                neutro: "text-slate-900",
                positivo: "text-positivo",
                riesgo: "text-riesgo",
                advertencia: "text-advertencia",
                tenue: "text-slate-400",
              }[tono],
        )}
      >
        {valor ?? SIN_DATO}
      </span>
      {children}
      {nota !== undefined && (
        <span className="cifras mt-1 text-[11px] leading-snug text-slate-500">{nota}</span>
      )}
    </div>
  );
}

/** Rejilla de tarjetas. Se adapta sin dejar huecos raros con 3 o 5 tarjetas. */
export function RejillaKPI({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4 print:grid-cols-4">{children}</div>
  );
}
