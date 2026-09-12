import clsx from "clsx";
import { type RefObject, useEffect, useRef, useState } from "react";

import { entero, nulo } from "../lib/format";
import type { NombreHoja } from "../lib/parse/tipos";
import type { Hallazgo, Severidad } from "../lib/schema";
import { TodoEnOrden } from "./ui/Callout";
import {
  type TonoValidacion,
  agruparPorSeveridad,
  conClave,
  partesConteo,
  resumirValidacion,
} from "./validacion";

/**
 * Panel de resultados de validacion.
 *
 * Se muestra SIEMPRE tras cargar, incluso sin incidencias: que no haya errores
 * es informacion, y un panel que solo aparece cuando algo falla deja al usuario
 * sin saber si su archivo se leyo bien.
 *
 * Los errores no bloquean la app. Bloquean el modulo afectado; lo demas se
 * calcula igual. Es la regla de degradacion elegante de CLAUDE.md.
 *
 * COMPRIMIDO POR OMISION, incluidos los errores. El panel es lo primero que se
 * ve al cargar y antes ocupaba media pantalla con diecinueve advertencias
 * rutinarias —"esta venta no trae dias de credito"— que empujaban el reporte
 * abajo del pliegue. El encabezado hace de semaforo: su tono dice, sin
 * desplegar nada, si hay algo que atender.
 *
 * Y COMPRIMIR NO ES ESCONDER: con errores presentes el panel nunca se cierra
 * del todo. Queda una linea con el conteo y un boton que abre el grupo y salta
 * al primer error. Reducir ruido y tapar problemas se parecen mucho en el
 * codigo y no se parecen en nada en un reporte financiero.
 */

/** Filas capturadas a mano por hoja: el panel las nombra como tales. */
type FilasCapturadas = Readonly<Record<NombreHoja, ReadonlySet<number>>>;

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

/** El semaforo del encabezado: borde y fondo, no solo el color del texto. */
const SEMAFORO: Readonly<Record<TonoValidacion, { seccion: string; encabezado: string }>> = {
  riesgo: { seccion: "border-riesgo/40", encabezado: "bg-red-50 border-riesgo/40" },
  advertencia: {
    seccion: "border-advertencia/40",
    encabezado: "bg-amber-50 border-advertencia/40",
  },
  neutro: { seccion: "border-slate-200", encabezado: "bg-slate-50 border-slate-200" },
};

export function PanelValidacion({
  hallazgos,
  filasLeidas,
  capturadas,
}: {
  hallazgos: readonly Hallazgo[];
  filasLeidas: number;
  capturadas: FilasCapturadas;
}) {
  const resumen = resumirValidacion(hallazgos, filasLeidas);
  const grupos = agruparPorSeveridad(hallazgos);

  const [abierto, setAbierto] = useState(false);
  // Ningun grupo arranca abierto, ni siquiera el de errores (C1). Al pedir
  // "Ver errores" se abre ese y solo ese.
  const [gruposAbiertos, setGruposAbiertos] = useState<readonly Severidad[]>([]);
  const [saltos, setSaltos] = useState(0);
  const primerError = useRef<HTMLLIElement | null>(null);
  const semaforo = SEMAFORO[resumen.tono];

  const alternarGrupo = (s: Severidad) => {
    setGruposAbiertos((previos) =>
      previos.includes(s) ? previos.filter((x) => x !== s) : [...previos, s],
    );
  };

  const verErrores = () => {
    setAbierto(true);
    setGruposAbiertos((previos) => (previos.includes("error") ? previos : [...previos, "error"]));
    setSaltos((n) => n + 1);
  };

  // El salto al primer error ocurre DESPUES de pintarlo: cuando se pide, el
  // grupo todavia esta cerrado y el elemento no existe en el documento.
  useEffect(() => {
    if (saltos === 0) return;
    const destino = primerError.current;
    if (destino === null) return;
    destino.scrollIntoView({ block: "center", behavior: "smooth" });
    // Tambien se lleva el foco: quien navega con teclado o lector de pantalla
    // no ve el desplazamiento y se quedaria donde estaba.
    destino.focus({ preventScroll: true });
  }, [saltos]);

  return (
    <section
      className={clsx("mb-4 border", semaforo.seccion)}
      aria-label="Resultados de validación"
    >
      <div
        className={clsx(
          "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b px-3 py-2",
          semaforo.encabezado,
        )}
      >
        <h2 className="text-sm font-semibold text-marino">Validación de los datos</h2>

        {/* El conteo va SIEMPRE visible, comprimido o no. */}
        <p className="text-xs text-slate-600">
          <span className="cifras">{entero(filasLeidas)}</span> filas leídas
          {resumen.total === 0 ? (
            <span className="text-positivo"> · sin incidencias</span>
          ) : (
            partesConteo(resumen.conteos).map((p) => (
              <span key={p.severidad} className={ESTILO[p.severidad].texto}>
                <span className="text-slate-400" aria-hidden="true">
                  {" · "}
                </span>
                <span className="cifras">{p.texto}</span>
              </span>
            ))
          )}
        </p>

        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-controls="detalle-validacion"
          className="toque border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-superficie focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-marino"
        >
          {abierto ? "Ocultar detalle" : "Ver detalle"}
        </button>
      </div>

      {/*
        C4: con errores el panel nunca queda reducido a su encabezado. Esta
        linea sobrevive al comprimido y lleva el acceso directo al primero.
      */}
      {!resumen.comprimibleDelTodo && !abierto && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-riesgo/30 bg-red-50 px-3 py-1.5">
          <span className="cifras text-xs text-riesgo">
            {resumen.conteos.error === 1
              ? "1 error bloquea el módulo afectado."
              : `${resumen.conteos.error} errores bloquean los módulos afectados.`}
          </span>
          <button
            type="button"
            onClick={verErrores}
            className="toque border border-riesgo/40 px-2 py-0.5 text-xs font-medium text-riesgo hover:bg-superficie focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-marino"
          >
            Ver errores
          </button>
        </div>
      )}

      <div id="detalle-validacion" hidden={!abierto} className="p-2">
        {resumen.total === 0 ? (
          resumen.vacio ? (
            <p className="px-1 py-2 text-xs text-slate-600">
              Todavía no hay datos: capture filas o cargue un archivo.
            </p>
          ) : (
            <TodoEnOrden titulo="Los datos se leyeron completos">
              Se revisaron <span className="cifras">{entero(filasLeidas)}</span> filas y no se
              encontró ninguna incidencia: ni errores, ni advertencias, ni notas.
            </TodoEnOrden>
          )
        ) : (
          <>
            {resumen.errores > 0 && (
              <p className="mb-2 px-1 text-xs text-slate-600">
                Los errores bloquean únicamente el módulo afectado. El resto del reporte se calcula
                con la información disponible.
              </p>
            )}
            {grupos.map((g) => (
              <GrupoHallazgos
                key={g.severidad}
                severidad={g.severidad}
                items={g.items}
                capturadas={capturadas}
                abierto={gruposAbiertos.includes(g.severidad)}
                onAlternar={() => alternarGrupo(g.severidad)}
                refPrimero={g.severidad === "error" ? primerError : null}
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function GrupoHallazgos({
  severidad,
  items,
  capturadas,
  abierto,
  onAlternar,
  refPrimero,
}: {
  severidad: Severidad;
  items: readonly Hallazgo[];
  capturadas: FilasCapturadas;
  abierto: boolean;
  onAlternar: () => void;
  /** Solo el grupo de errores: el destino del botón «Ver errores». */
  refPrimero: RefObject<HTMLLIElement | null> | null;
}) {
  const estilo = ESTILO[severidad];

  return (
    <div className={clsx("mb-2 border last:mb-0", estilo.borde)}>
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierto}
        className={clsx(
          "toque flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs font-medium",
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
          {conClave(items).map(({ clave, h }, i) => (
            <li
              key={clave}
              ref={i === 0 ? refPrimero : null}
              tabIndex={i === 0 && refPrimero !== null ? -1 : undefined}
              className="px-2 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-riesgo"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="cifras text-[11px] text-slate-500">
                  {h.hoja}
                  {h.fila !== undefined && <> · fila {h.fila}</>}
                  {h.fila !== undefined && h.hoja !== "parametros" && capturadas[h.hoja].has(h.fila) && (
                    <span className="ml-1 rounded-sm bg-marino px-1 text-[10px] font-semibold text-sobre-color">
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
