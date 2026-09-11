import clsx from "clsx";
import { Component, type ReactNode, Suspense, lazy, useMemo } from "react";

import { useImprimiendo } from "./contextoImpresion";
import { cargarGraficas } from "./cargaGraficas";
import {
  type PuntosGrafica,
  type SerieGrafica,
  type TipoGrafica,
  VARIABLE_COLOR,
  esCategorica,
  etiquetasEje,
  filasRecharts,
} from "./datosGrafica";

/**
 * Grafica del reporte: lo que usan los modulos. Pasan meses o categorias,
 * series y centavos; nunca configuracion de recharts.
 *
 * Este archivo NO importa recharts. El dibujo vive en `GraficaLienzo.tsx` y se
 * carga bajo demanda: mientras llega, se reserva el mismo alto para que la
 * pagina no salte. Si la descarga falla, la grafica dice que no pudo cargarse
 * en su lugar; el resto del modulo sigue en pie.
 */

const Lienzo = lazy(() => cargarGraficas().then((m) => ({ default: m.GraficaLienzo })));

export function Grafica({
  tipo,
  series,
  puntos,
  etiqueta,
  alto = 240,
  vacio = "Sin datos que graficar.",
}: {
  readonly tipo: TipoGrafica;
  readonly series: readonly SerieGrafica[];
  /** Todos meses o todos categorias; el tipo impide mezclarlos. */
  readonly puntos: PuntosGrafica;
  /** Descripcion para lectores de pantalla: que muestra la grafica. */
  readonly etiqueta: string;
  /** Alto en px del area de la grafica, sin contar la leyenda. */
  readonly alto?: number;
  readonly vacio?: ReactNode;
}) {
  const filas = useMemo(() => filasRecharts(puntos, series), [puntos, series]);
  const etiquetas = useMemo(() => etiquetasEje(puntos), [puntos]);
  const imprimiendo = useImprimiendo();

  if (filas.length === 0) {
    return (
      <p className="border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
        {vacio}
      </p>
    );
  }

  return (
    <figure className="imp-bloque m-0" aria-label={etiqueta}>
      <Leyenda series={series} linea={tipo === "linea"} />
      <BarreraGrafica alto={alto}>
        <Suspense fallback={<Reserva alto={alto} texto="Cargando la gráfica…" />}>
          <Lienzo
            tipo={tipo}
            series={series}
            filas={filas}
            etiquetas={etiquetas}
            categorica={esCategorica(puntos)}
            imprimiendo={imprimiendo}
            alto={alto}
          />
        </Suspense>
      </BarreraGrafica>
    </figure>
  );
}

/** Espacio del mismo alto que la grafica, mientras llega o si no llego. */
function Reserva({ alto, texto, error = false }: { alto: number; texto: string; error?: boolean }) {
  return (
    <div
      style={{ height: alto }}
      className={clsx(
        "flex items-center justify-center border border-dashed text-[11px]",
        error ? "border-riesgo/40 text-riesgo" : "border-slate-200 text-slate-400",
      )}
    >
      {texto}
    </div>
  );
}

/**
 * Si el chunk de la grafica no se puede descargar, `lazy` lanza. Sin esta
 * barrera ese error tumbaria la app completa; con ella, solo la grafica dice
 * que no pudo cargarse. Degradacion elegante hasta en la red.
 */
class BarreraGrafica extends Component<{ alto: number; children: ReactNode }, { fallo: boolean }> {
  override state = { fallo: false };

  static getDerivedStateFromError(): { fallo: boolean } {
    return { fallo: true };
  }

  override render() {
    if (this.state.fallo) {
      return (
        <Reserva
          alto={this.props.alto}
          texto="No se pudo cargar la gráfica. Las cifras siguen en las tablas; recargue la página para reintentar."
          error
        />
      );
    }
    return this.props.children;
  }
}

/** Leyenda fija. Muestra una raya para las lineas y un cuadro para las barras. */
function Leyenda({ series, linea }: { series: readonly SerieGrafica[]; linea: boolean }) {
  return (
    <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
      {series.map((s) => (
        <li key={s.clave} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={clsx("inline-block shrink-0", linea ? "h-0.5 w-4" : "h-2.5 w-2.5")}
            style={{ backgroundColor: VARIABLE_COLOR[s.color] }}
          />
          {s.etiqueta}
        </li>
      ))}
    </ul>
  );
}
