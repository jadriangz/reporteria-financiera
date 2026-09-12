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
    <div className="imp-bloque flex min-w-0 flex-col border border-slate-200 bg-superficie px-3 py-2">
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
                tenue: "text-slate-500",
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

/**
 * Ancho minimo de una tarjeta para que siga siendo legible.
 *
 * 14rem = 224 px. Es lo que ocupan una etiqueta como "Cartera +180 dias", una
 * cifra de nueve digitos a `text-xl` y una nota al pie sin que ninguna de las
 * tres se parta en dos renglones. Por debajo de eso la tarjeta deja de
 * cumplir su trabajo, que es que la cifra se lea de un vistazo.
 */
export const MINIMO_TARJETA = "14rem";

/*
 * El valor va escrito COMPLETO en el className de abajo, no interpolado desde
 * la constante: Tailwind genera las utilidades leyendo el texto del archivo, y
 * una clase armada con `${...}` no existe para el. La constante se queda como
 * documentacion del numero y para que una prueba pueda comprobar que los dos
 * coinciden.
 */

/**
 * Rejilla de tarjetas. El NUMERO DE COLUMNAS LO DECIDE EL ANCHO, no el
 * dispositivo.
 *
 * `auto-fit` con `minmax()` mete tantas columnas como quepan respetando el
 * minimo legible, y reparte el sobrante entre ellas. No hay una lista de
 * anchos de dispositivo que enumerar: a 360 px sale una columna, a 768 tres, a
 * 1440 seis, y en un ancho intermedio que nadie previo, el que toque.
 *
 * El `min(100%, ...)` no es decorativo: sin el, en un contenedor mas angosto
 * que el minimo la pista seguiria midiendo 14rem y la tarjeta desbordaria la
 * pantalla en vez de encogerse.
 *
 * En papel la rejilla vuelve a cuatro columnas fijas: la hoja carta siempre
 * mide lo mismo y el reporte impreso no debe cambiar de forma segun el ancho
 * que tuviera la ventana al momento de imprimir.
 */
export function RejillaKPI({ children }: { children: ReactNode }) {
  return (
    <div
      className="mb-4 grid gap-2 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] print:grid-cols-4"
    >
      {children}
    </div>
  );
}
