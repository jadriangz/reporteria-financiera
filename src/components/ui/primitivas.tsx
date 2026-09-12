import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Primitivas compartidas.
 *
 * Direccion visual: sobrio y financiero, densidad alta, fondo blanco, marino
 * institucional. Quien lee esto compara cifras; no explora. Nada de tarjetas
 * gigantes con un solo numero.
 */

/**
 * Cuanto ancho pide un bloque para hacer su trabajo.
 *
 * No es "cuanto quiero ocupar", es "por debajo de esto dejo de servir". Una
 * cascada de tres columnas necesita 24rem; una tabla de doce meses necesita la
 * hoja entera. El bloque declara su minimo y la rejilla decide quien comparte
 * renglon con quien: no hay una lista de parejas escrita a mano que se caiga en
 * cuanto alguien agregue una seccion nueva.
 */
export type MinimoSeccion = "24rem" | "30rem" | "32rem" | "48rem" | "completo";

/** Clase de `flex-basis` por minimo. Literales: Tailwind lee el texto. */
const BASE_SECCION: Readonly<Record<MinimoSeccion, string>> = {
  "24rem": "basis-96",
  "30rem": "basis-[30rem]",
  "32rem": "basis-[32rem]",
  "48rem": "basis-[48rem]",
  completo: "basis-full",
};

/**
 * Contenedor de secciones. Renglones que se llenan, no una pila.
 *
 * Es `flex-wrap` y no `grid` a proposito: con `grid` todas las pistas miden lo
 * mismo, asi que el minimo tendria que ser el de la seccion mas exigente y las
 * angostas quedarian igual de desperdiciadas. Con `flex-wrap`, CADA bloque
 * lleva su propio `flex-basis` y crece para llenar el renglon; dos bloques
 * angostos comparten renglon y uno ancho se lo queda entero, sin que nadie haya
 * enumerado anchos de pantalla.
 *
 * En papel vuelve a ser una pila: `print:block` desactiva el flex y cada
 * seccion ocupa el ancho de la hoja, como en la version impresa de siempre.
 */
export function RejillaSecciones({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-start gap-x-4 print:block">{children}</div>;
}

export function Seccion({
  titulo,
  descripcion,
  acciones,
  minimo = "completo",
  children,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
  /**
   * Ancho minimo que el bloque necesita. Solo tiene efecto dentro de
   * `RejillaSecciones`; suelto, la seccion ocupa el ancho que tenga.
   */
  minimo?: MinimoSeccion;
  children: ReactNode;
}) {
  return (
    <section
      className={clsx(
        "mb-6 border border-slate-200",
        // `min-w-0` es obligatorio: sin el, un hijo ancho (una tabla) le fija a
        // la seccion un minimo intrinseco enorme y el renglon desborda.
        "min-w-0 grow print:w-auto",
        BASE_SECCION[minimo],
      )}
    >
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
          tenue: "text-slate-500",
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
  barra = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variante?: "normal" | "primario" | "peligro";
  type?: "button" | "submit";
  disabled?: boolean;
  /**
   * Boton de barra de herramientas: mide 44 px de alto de verdad.
   *
   * En la barra superior el espacio vertical sobra y el control es de uso
   * frecuente, asi que ahi el objetivo tactil se consigue agrandando la caja.
   * En cambio un "Ver detalle" dentro del encabezado de una seccion no puede
   * medir 44 px sin inflar la seccion entera: ese usa `toque`, que agranda solo
   * el area que recibe el dedo. Ver `index.css`.
   */
  barra?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "rounded-sm text-xs font-medium transition-colors print:hidden",
        barra
          ? "inline-flex min-h-11 items-center justify-center px-3"
          : "toque px-2.5 py-1",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marino",
        "disabled:cursor-not-allowed disabled:opacity-40",
        {
          normal: "border border-slate-300 bg-superficie text-slate-700 hover:bg-slate-50",
          primario: "bg-marino text-sobre-color hover:bg-marino/90",
          peligro: "border border-slate-300 bg-superficie text-riesgo hover:bg-red-50",
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
