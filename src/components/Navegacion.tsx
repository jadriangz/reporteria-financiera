import clsx from "clsx";

import type { Capacidades } from "../lib/schema";
import { MODULOS, MOTIVO_DESHABILITADO, useAppStore } from "../store/useAppStore";

/**
 * Navegacion entre los seis modulos.
 *
 * Un modulo que no puede calcularse aparece DESHABILITADO con el motivo a la
 * vista, nunca oculto: si desaparece, el usuario no sabe que existe ni que le
 * falta capturar para tenerlo. Ese aviso es la mitad del valor de la app.
 *
 * Sin react-router: el modulo activo es estado del store.
 */
export function Navegacion({ capacidades }: { capacidades: Capacidades }) {
  const moduloActivo = useAppStore((s) => s.moduloActivo);
  const irAModulo = useAppStore((s) => s.irAModulo);
  const pantalla = useAppStore((s) => s.pantalla);
  const irACaptura = useAppStore((s) => s.irACaptura);

  return (
    <nav aria-label="Módulos del reporte" className="border-b border-slate-200 bg-white">
      <ul className="flex flex-wrap items-stretch gap-px px-2">
        {MODULOS.map((m) => {
          const habilitado = capacidades[m.requiere];
          const activo = pantalla === "reporte" && m.id === moduloActivo;
          const motivo = MOTIVO_DESHABILITADO[m.requiere];

          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => irAModulo(m.id)}
                disabled={!habilitado}
                aria-current={activo ? "page" : undefined}
                title={habilitado ? undefined : motivo}
                className={clsx(
                  "flex h-full flex-col justify-center border-b-2 px-3 py-1.5 text-left text-xs transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marino",
                  activo
                    ? "border-marino font-semibold text-marino"
                    : "border-transparent text-slate-600",
                  habilitado
                    ? "hover:bg-slate-50"
                    : "cursor-not-allowed text-slate-400 hover:bg-transparent",
                )}
              >
                <span>{m.titulo}</span>
                {!habilitado && (
                  <span className="text-[10px] font-normal text-advertencia">{motivo}</span>
                )}
              </button>
            </li>
          );
        })}
        <li className="ml-auto">
          <button
            type="button"
            onClick={irACaptura}
            aria-current={pantalla === "captura" ? "page" : undefined}
            className={clsx(
              "flex h-full flex-col justify-center border-b-2 px-3 py-1.5 text-left text-xs transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marino",
              pantalla === "captura"
                ? "border-marino font-semibold text-marino"
                : "border-transparent text-slate-600 hover:bg-slate-50",
            )}
          >
            <span>Capturar datos</span>
            <span className="text-[10px] font-normal text-slate-500">Agregar filas a mano</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
