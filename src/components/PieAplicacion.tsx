import { ETIQUETA_VERSION } from "../version";

/**
 * Pie de la aplicacion.
 *
 * Lleva la version y el recordatorio de que nada sale del navegador. Nunca se
 * imprime: el PDF lleva su propio pie, con la version en cada hoja.
 */
export function PieAplicacion() {
  return (
    <footer className="print:hidden border-t border-slate-200 px-4 py-3 text-[11px] text-slate-500">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span>
          Generador de reportería financiera{" "}
          <span className="cifras font-medium text-slate-600">{ETIQUETA_VERSION}</span>
        </span>
        <span>Procesamiento local: ningún dato sale de este navegador.</span>
      </div>
    </footer>
  );
}
