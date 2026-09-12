import { fechaCorta } from "../../lib/format";
import type { ClaveGrafica } from "../../lib/tema/paleta";

/**
 * Tipos y logica pura de las graficas.
 *
 * Vive fuera de `Grafica.tsx` por la misma razon que `tabla.ts`: el archivo del
 * componente exporta solo componentes, y la transformacion de datos se prueba
 * en node sin renderizar nada.
 *
 * Los modulos hablan en fechas o categorias, series y centavos. Nunca en
 * `dataKey`, `stackId` ni props de recharts: esa traduccion ocurre solo aqui.
 */

export type TipoGrafica = "barras" | "barras-apiladas" | "linea";

/**
 * Color de una serie, por token del tema. Se nombra igual que el token para que
 * el modulo elija "positivo" y no un hexadecimal suelto.
 *
 * El valor concreto sale de `lib/tema/paleta`, resuelto contra el tema que esté
 * activo donde se pinta la grafica. Ningun modulo ve un color nunca.
 */
export type ColorSerie = Extract<
  ClaveGrafica,
  "marino" | "positivo" | "riesgo" | "advertencia" | "tenue"
>;

export interface SerieGrafica {
  /** Llave de la serie dentro de `valores`. */
  readonly clave: string;
  readonly etiqueta: string;
  readonly color: ColorSerie;
}

/**
 * Valor de cada serie en centavos. `null` es "no hay dato" y se dibuja como
 * hueco; nunca se convierte en cero, que seria una afirmacion distinta.
 */
export type ValoresPunto = Readonly<Record<string, number | null>>;

/** Un mes en un eje de tiempo. La etiqueta sale de `fechaCorta`. */
export interface PuntoTemporal {
  readonly fecha: Date;
  readonly valores: ValoresPunto;
}

/** Una categoria en un eje sin orden temporal: un modelo, un cliente. */
export interface PuntoCategoria {
  readonly categoria: string;
  readonly valores: ValoresPunto;
}

/**
 * Los puntos de una grafica son todos de tiempo o todos de categoria: una
 * grafica que mezclara meses y modelos en el mismo eje no significaria nada,
 * y el tipo lo impide.
 */
export type PuntosGrafica = readonly PuntoTemporal[] | readonly PuntoCategoria[];

/** Fila en el formato que consume recharts. */
export interface FilaRecharts {
  /** Posicion del punto en el eje: es la categoria de recharts. */
  readonly x: number;
  readonly [dataKey: string]: number | null;
}

/**
 * `dataKey` interno de cada serie.
 *
 * No se usa la clave del modulo directamente para que ninguna serie pueda
 * llamarse "x" y pisar la categoria del eje.
 */
export function dataKeyDe(indice: number): string {
  return `s${indice}`;
}

/** ¿El eje es de categorias? Un eje vacio se trata como temporal. */
export function esCategorica(puntos: PuntosGrafica): puntos is readonly PuntoCategoria[] {
  const primero = puntos[0];
  return primero !== undefined && "categoria" in primero;
}

/**
 * Etiqueta de cada punto del eje, en orden. Las fechas pasan por `fechaCorta`,
 * el mismo formato de mes que el resto del reporte.
 */
export function etiquetasEje(puntos: PuntosGrafica): string[] {
  if (esCategorica(puntos)) return puntos.map((p) => p.categoria);
  return puntos.map((p) => fechaCorta(p.fecha));
}

/**
 * Traduce los puntos del modulo a filas de recharts.
 *
 * El eje X usa la posicion del punto, no su etiqueta: dos categorias con el
 * mismo nombre no se funden en una barra, y el tooltip encuentra su fila por
 * indice sin ambiguedad.
 *
 * Una serie que no aparece en `valores` llega como `null` (hueco), no como
 * `undefined`: recharts trata ambos igual, pero asi la fila es explicita y se
 * puede comparar en una prueba.
 */
export function filasRecharts(
  puntos: PuntosGrafica,
  series: readonly SerieGrafica[],
): FilaRecharts[] {
  const valores: readonly ValoresPunto[] = puntos.map((p) => p.valores);
  return valores.map((v, indice) =>
    Object.assign(
      Object.fromEntries(
        series.map((s, i) => {
          const valor = v[s.clave];
          return [dataKeyDe(i), valor === undefined || !Number.isFinite(valor) ? null : valor];
        }),
      ),
      // Al final, para que ninguna serie pueda pisar la posicion.
      { x: indice },
    ),
  );
}
