import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Primitivas compartidas.
 *
 * Direccion visual: sobrio y financiero, densidad alta, fondo blanco, marino
 * institucional. Quien lee esto compara cifras; no explora. Nada de tarjetas
 * gigantes con un solo numero.
 */

export function Seccion({
  titulo,
  descripcion,
  acciones,
  children,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-6 border border-slate-200">
      <header className="imp-titulo flex items-baseline justify-between gap-4 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold text-marino">{titulo}</h2>
          {descripcion !== undefined && (
            <p className="mt-0.5 text-xs text-slate-500">{descripcion}</p>
          )}
        </div>
        {acciones !== undefined && <div className="print:hidden">{acciones}</div>}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

/**
 * Cifra monetaria o numerica. SIEMPRE alineada a la derecha y con numeros
 * tabulares: sin `.cifras` las columnas de importes no alinean y comparar dos
 * cantidades deja de ser posible de un vistazo.
 */
export type Tono = "neutro" | "positivo" | "riesgo" | "advertencia" | "tenue";

export function Cifra({
  children,
  tono = "neutro",
  className,
}: {
  children: ReactNode;
  tono?: Tono;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "cifras tabular-nums",
        {
          neutro: "text-slate-900",
          positivo: "text-positivo",
          riesgo: "text-riesgo",
          advertencia: "text-advertencia",
          tenue: "text-slate-400",
        }[tono],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Etiqueta breve para un dato. Texto a la izquierda, cifra a la derecha. */
export function Dato({
  etiqueta,
  children,
  tono = "neutro",
}: {
  etiqueta: string;
  children: ReactNode;
  tono?: Tono;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1 last:border-0">
      <span className="text-xs text-slate-600">{etiqueta}</span>
      <Cifra tono={tono} className="text-sm font-medium">
        {children}
      </Cifra>
    </div>
  );
}

export function Boton({
  children,
  onClick,
  variante = "normal",
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variante?: "normal" | "primario" | "peligro";
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors print:hidden",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marino",
        "disabled:cursor-not-allowed disabled:opacity-40",
        {
          normal: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
          primario: "bg-marino text-white hover:bg-marino/90",
          peligro: "border border-slate-300 bg-white text-riesgo hover:bg-red-50",
        }[variante],
      )}
    >
      {children}
    </button>
  );
}

/** Aviso de que un modulo no puede calcularse, con el motivo concreto. */
export function Deshabilitado({ motivo }: { motivo: string }) {
  return (
    <div className="border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <p className="text-sm font-medium text-slate-600">Este módulo no puede calcularse</p>
      <p className="mt-1 text-xs text-advertencia">{motivo}</p>
      <p className="mt-3 text-xs text-slate-500">
        Complete la información en la plantilla y vuelva a cargar el archivo.
      </p>
    </div>
  );
}

/**
 * Volcado del objeto de resultado del motor.
 *
 * Andamiaje deliberado del paso 3: sirve para verificar a ojo que el motor
 * entrega lo que debe. La UI real de cada modulo llega en las siguientes
 * sesiones y sustituye esto por tablas y graficas.
 */
export function Volcado({ valor }: { valor: unknown }) {
  return (
    <pre className="cifras max-h-[60vh] overflow-auto border border-slate-200 bg-slate-50 p-3 text-[11px] leading-tight text-slate-700">
      {JSON.stringify(valor, reemplazarFechas, 2)}
    </pre>
  );
}

/** JSON.stringify convierte Date a ISO; aqui se acorta para poder leerlo. */
function reemplazarFechas(_clave: string, valor: unknown): unknown {
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(valor)) {
    return valor.slice(0, 10);
  }
  return valor;
}
