import clsx from "clsx";
import { useState } from "react";

import { entero, nulo } from "../lib/format";
import type { NombreHoja } from "../lib/parse/tipos";
import type { Hallazgo, Severidad } from "../lib/schema";

/**
 * Panel de resultados de validacion.
 *
 * Se muestra SIEMPRE tras cargar, incluso sin incidencias: que no haya errores
 * es informacion, y un panel que solo aparece cuando algo falla deja al usuario
 * sin saber si su archivo se leyo bien.
 *
 * Los errores no bloquean la app. Bloquean el modulo afectado; lo demas se
 * calcula igual. Es la regla de degradacion elegante de CLAUDE.md.
 */

const ORDEN: readonly Severidad[] = ["error", "advertencia", "info"];

const ESTILO: Readonly<
  Record<Severidad, { etiqueta: string; texto: string; borde: string; fondo: string; punto: string }>
> = {
  error: {
    etiqueta: "Errores",
    texto: "text-riesgo",
    borde: "border-riesgo/30",
    fondo: "bg-red-50",
    punto: "bg-riesgo",
  },
  advertencia: {
    etiqueta: "Advertencias",
    texto: "text-advertencia",
    borde: "border-advertencia/30",
    fondo: "bg-amber-50",
    punto: "bg-advertencia",
  },
  info: {
    etiqueta: "Información",
    texto: "text-marino",
    borde: "border-slate-200",
    fondo: "bg-slate-50",
    punto: "bg-marino",
  },
};

/** Filas capturadas a mano por hoja: el panel las nombra como tales. */
type FilasCapturadas = Readonly<Record<NombreHoja, ReadonlySet<number>>>;

export function PanelValidacion({
  hallazgos,
  filasLeidas,
  capturadas,
}: {
  hallazgos: readonly Hallazgo[];
  filasLeidas: number;
  capturadas: FilasCapturadas;
}) {
  const porSeveridad = ORDEN.map((s) => ({
    severidad: s,
    items: hallazgos.filter((h) => h.severidad === s),
  })).filter((g) => g.items.length > 0);

  const errores = hallazgos.filter((h) => h.severidad === "error").length;

  return (
    <section className="mb-4 border border-slate-200" aria-label="Resultados de validación">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h2 className="text-sm font-semibold text-marino">Validación de los datos</h2>
        <p className="text-xs text-slate-600">
          <span className="cifras">{entero(filasLeidas)}</span> filas leídas
          {hallazgos.length === 0 ? (
            <span className="text-positivo"> · sin incidencias</span>
          ) : (
            <>
              {" · "}
              {ORDEN.filter((s) => hallazgos.some((h) => h.severidad === s)).map((s, i) => (
                <span key={s} className={ESTILO[s].texto}>
                  {i > 0 && <span className="text-slate-400"> · </span>}
                  <span className="cifras">{hallazgos.filter((h) => h.severidad === s).length}</span>{" "}
                  {ESTILO[s].etiqueta.toLowerCase()}
                </span>
              ))}
            </>
          )}
        </p>
      </header>

      <div className="p-2">
        {hallazgos.length === 0 ? (
          <p className={clsx("px-1 py-2 text-xs", filasLeidas === 0 ? "text-slate-600" : "text-positivo")}>
            {filasLeidas === 0
              ? "Todavía no hay datos: capture filas o cargue un archivo."
              : "Los datos se leyeron completos y no se encontró ninguna incidencia."}
          </p>
        ) : (
          <>
            {errores > 0 && (
              <p className="mb-2 px-1 text-xs text-slate-600">
                Los errores bloquean únicamente el módulo afectado. El resto del reporte se calcula
                con la información disponible.
              </p>
            )}
            {porSeveridad.map((g) => (
              <GrupoHallazgos key={g.severidad} severidad={g.severidad} items={g.items} capturadas={capturadas} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Clave estable derivada del contenido del hallazgo, no de su posicion.
 * Dos hallazgos identicos son posibles (misma hoja, mismo campo, sin fila), asi
 * que se desempata con un contador de repeticiones en vez de con el indice.
 */
function conClave(items: readonly Hallazgo[]): { clave: string; h: Hallazgo }[] {
  const vistos = new Map<string, number>();
  return items.map((h) => {
    const base = `${h.hoja}|${h.fila ?? ""}|${h.campo ?? ""}|${h.mensaje}`;
    const repeticion = vistos.get(base) ?? 0;
    vistos.set(base, repeticion + 1);
    return { clave: repeticion === 0 ? base : `${base}#${repeticion}`, h };
  });
}

function GrupoHallazgos({
  severidad,
  items,
  capturadas,
}: {
  severidad: Severidad;
  items: readonly Hallazgo[];
  capturadas: FilasCapturadas;
}) {
  // Los errores arrancan abiertos: hay que actuar sobre ellos. El resto no.
  const [abierto, setAbierto] = useState(severidad === "error");
  const estilo = ESTILO[severidad];

  return (
    <div className={clsx("mb-2 border last:mb-0", estilo.borde)}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className={clsx(
          "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs font-medium",
          estilo.fondo,
          estilo.texto,
          "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marino",
        )}
      >
        <span aria-hidden="true" className="text-slate-400">
          {abierto ? "▾" : "▸"}
        </span>
        <span className={clsx("h-2 w-2 rounded-full", estilo.punto)} aria-hidden="true" />
        {estilo.etiqueta}
        <span className="cifras ml-auto text-slate-500">{items.length}</span>
      </button>

      {abierto && (
        <ul className="divide-y divide-slate-100">
          {conClave(items).map(({ clave, h }) => (
            <li key={clave} className="px-2 py-1.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="cifras text-[11px] text-slate-500">
                  {h.hoja}
                  {h.fila !== undefined && <> · fila {h.fila}</>}
                  {h.fila !== undefined && h.hoja !== "parametros" && capturadas[h.hoja].has(h.fila) && (
                    <span className="ml-1 rounded-sm bg-marino px-1 text-[10px] font-semibold text-white">
                      A mano
                    </span>
                  )}
                  {h.campo !== undefined && <> · {h.campo}</>}
                </span>
                <span className="text-xs text-slate-800">{h.mensaje}</span>
              </div>
              {h.accion !== undefined && (
                <p className="mt-0.5 text-[11px] text-slate-500">→ {nulo(h.accion)}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
