import { type RefObject, useEffect, useState } from "react";

/**
 * Estado del desplazamiento horizontal de un contenedor.
 *
 * Existe para poder DECIR que hay más contenido a la derecha. Un degradado en
 * el borde no basta por sí solo: no lo ve quien navega con lector de pantalla,
 * ni quien tiene el contraste reducido, ni se distingue de una sombra
 * decorativa. Con este estado la tabla puede pintar el degradado **y** escribir
 * la nota, que es lo que de verdad informa.
 */
export interface Desplazamiento {
  /** Hay más ancho del que cabe: el contenedor se puede desplazar. */
  readonly desplazable: boolean;
  /** Ya se llegó al extremo derecho; no queda nada más que ver por ahí. */
  readonly alFinal: boolean;
}

const QUIETO: Desplazamiento = { desplazable: false, alFinal: true };

/** Tolerancia en píxeles: el desplazamiento sub-píxel no es "hay más". */
const HOLGURA = 1;

export function useDesplazamientoHorizontal(
  contenedor: RefObject<HTMLElement | null>,
): Desplazamiento {
  const [estado, setEstado] = useState<Desplazamiento>(QUIETO);

  useEffect(() => {
    const el = contenedor.current;
    if (el === null) return;

    const medir = () => {
      const desplazable = el.scrollWidth - el.clientWidth > HOLGURA;
      const alFinal = el.scrollLeft + el.clientWidth >= el.scrollWidth - HOLGURA;
      setEstado((previo) =>
        previo.desplazable === desplazable && previo.alFinal === alFinal
          ? previo
          : { desplazable, alFinal },
      );
    };

    medir();
    el.addEventListener("scroll", medir, { passive: true });

    // El ancho disponible cambia sin que nadie navegue: al cambiar de módulo,
    // al girar el teléfono, al abrir los parámetros de la barra superior. Sin
    // observar el tamaño, la nota se quedaría dicha para un ancho que ya pasó.
    const observador =
      typeof ResizeObserver === "function" ? new ResizeObserver(medir) : null;
    observador?.observe(el);

    return () => {
      el.removeEventListener("scroll", medir);
      observador?.disconnect();
    };
  }, [contenedor]);

  return estado;
}
