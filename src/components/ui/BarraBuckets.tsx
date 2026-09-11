import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Barra horizontal segmentada con leyenda.
 *
 * No sabe que es un bucket de antiguedad: recibe segmentos con su peso, su
 * etiqueta y su valor ya formateado. Sirve igual para una composicion de gastos
 * o para el reparto de venta por linea.
 */

/**
 * Estilo del segmento. Se nombra por intencion, no por color, para que el modulo
 * exprese "esto es riesgo" y no "esto es rojo".
 *
 * `indefinido` es deliberadamente distinto de la escala fresco-a-riesgo: marca
 * lo que no se pudo clasificar, que no es lo mismo que lo que esta muy vencido.
 */
export type EstiloSegmento = "fresco" | "vigilar" | "tension" | "riesgo" | "critico" | "indefinido";

const RELLENO: Readonly<Record<EstiloSegmento, string>> = {
  fresco: "bg-positivo",
  vigilar: "bg-marino",
  tension: "bg-advertencia",
  riesgo: "bg-riesgo/60",
  critico: "bg-riesgo",
  // Rayado sobre ambar: es una advertencia, pero no pertenece a la escala de
  // antiguedad, y el rayado impide confundirlo con el tramo "tension".
  indefinido:
    "bg-advertencia bg-[repeating-linear-gradient(45deg,transparent_0_4px,color-mix(in_srgb,var(--color-papel)_55%,transparent)_4px_8px)]",
};

const PUNTO: Readonly<Record<EstiloSegmento, string>> = {
  fresco: "bg-positivo",
  vigilar: "bg-marino",
  tension: "bg-advertencia",
  riesgo: "bg-riesgo/60",
  critico: "bg-riesgo",
  indefinido: "bg-advertencia",
};

export interface Segmento {
  readonly clave: string;
  readonly etiqueta: string;
  /** Peso relativo del segmento. Debe ser >= 0. */
  readonly valor: number;
  /** Valor ya formateado para la leyenda. */
  readonly texto: string;
  readonly estilo: EstiloSegmento;
  /** Participacion ya formateada, si se quiere mostrar. */
  readonly participacion?: string | undefined;
  /** Aclaracion breve bajo la etiqueta. */
  readonly nota?: string | undefined;
}

export function BarraBuckets({
  segmentos,
  vacio = "Sin montos que distribuir.",
  etiqueta,
}: {
  readonly segmentos: readonly Segmento[];
  readonly vacio?: ReactNode;
  readonly etiqueta?: string;
}) {
  const total = segmentos.reduce((t, s) => t + Math.max(0, s.valor), 0);

  return (
    <div className="imp-bloque">
      {total <= 0 ? (
        <p className="border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
          {vacio}
        </p>
      ) : (
        <div
          className="flex h-6 w-full overflow-hidden rounded-sm"
          role="img"
          aria-label={etiqueta}
        >
          {segmentos
            .filter((s) => s.valor > 0)
            .map((s) => (
              <div
                key={s.clave}
                className={clsx(RELLENO[s.estilo], "h-full")}
                style={{ width: `${((s.valor / total) * 100).toFixed(4)}%` }}
                title={`${s.etiqueta}: ${s.texto}`}
              />
            ))}
        </div>
      )}

      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-6">
        {segmentos.map((s) => (
          <li key={s.clave} className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={clsx("h-2 w-2 shrink-0 rounded-full", PUNTO[s.estilo])}
              />
              <span className="truncate text-[11px] text-slate-600">{s.etiqueta}</span>
            </div>
            <div className="mt-0.5 pl-3.5">
              <span
                className={clsx(
                  "cifras block text-xs font-medium tabular-nums",
                  s.valor > 0 ? "text-slate-900" : "text-slate-400",
                )}
              >
                {s.texto}
              </span>
              {s.participacion !== undefined && (
                <span className="cifras text-[10px] text-slate-500">{s.participacion}</span>
              )}
              {s.nota !== undefined && (
                <span className="block text-[10px] leading-tight text-advertencia">{s.nota}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
