import clsx from "clsx";

import { ETIQUETA_TEMA, TEMAS, type Tema } from "../lib/tema";
import { useTema } from "../store/useTema";

/**
 * Control de tema: claro, oscuro o el del sistema.
 *
 * TRES BOTONES, NO UN INTERRUPTOR DE SOL Y LUNA. Con dos íconos solo se pueden
 * representar dos estados, y aquí hay tres: un icono de luna no distingue
 * «oscuro porque lo elegí» de «oscuro porque mi sistema lo está». Esa diferencia
 * importa —si el usuario eligió «sistema», la pantalla va a cambiar sola al
 * anochecer— y esconderla convierte ese cambio en un misterio.
 *
 * Accesibilidad: es un `radiogroup`. Tab entra al grupo, las flechas se mueven
 * entre opciones (comportamiento nativo de los `radio`) y el lector de pantalla
 * anuncia nombre, estado y qué se está aplicando de verdad cuando la opción es
 * «Sistema».
 */
export function SelectorTema() {
  const tema = useTema((s) => s.tema);
  const resuelto = useTema((s) => s.resuelto);
  const elegirTema = useTema((s) => s.elegirTema);

  return (
    <fieldset
      className="print:hidden flex min-w-0 items-center gap-1 border-0 p-0"
      aria-label={`Tema de la interfaz. Ahora en ${ETIQUETA_TEMA[tema].toLowerCase()}${
        tema === "sistema" ? `, que se está mostrando en ${resuelto}` : ""
      }.`}
    >
      <legend className="sr-only">Tema de la interfaz</legend>
      <span aria-hidden="true" className="mr-0.5 text-xs text-slate-600">
        Tema
      </span>
      <div className="flex border border-slate-300">
        {TEMAS.map((t) => (
          <OpcionTema
            key={t}
            valor={t}
            elegido={tema === t}
            resuelto={t === "sistema" ? resuelto : null}
            onElegir={elegirTema}
          />
        ))}
      </div>
    </fieldset>
  );
}

function OpcionTema({
  valor,
  elegido,
  resuelto,
  onElegir,
}: {
  valor: Tema;
  elegido: boolean;
  /** Solo en «Sistema»: qué tema está aplicando ahora mismo. */
  resuelto: string | null;
  onElegir: (t: Tema) => void;
}) {
  const etiqueta = ETIQUETA_TEMA[valor];

  return (
    <label
      className={clsx(
        // 44 px de alto de verdad: es un control de barra de herramientas, de
        // los que se tocan con el pulgar, y ahi el espacio vertical sobra.
        "inline-flex min-h-11 cursor-pointer items-center px-3 text-xs",
        "focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-marino",
        elegido
          ? "bg-marino font-medium text-sobre-color"
          : "text-slate-600 hover:bg-slate-50",
      )}
    >
      <input
        type="radio"
        name="tema"
        value={valor}
        checked={elegido}
        onChange={() => onElegir(valor)}
        className="sr-only"
      />
      {etiqueta}
      {resuelto !== null && (
        // Solo para el lector de pantalla: en pantalla ya se ve el resultado.
        <span className="sr-only"> (ahora {resuelto})</span>
      )}
    </label>
  );
}
