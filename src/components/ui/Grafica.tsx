import clsx from "clsx";
import {
  Component,
  type ReactNode,
  type RefObject,
  Suspense,
  lazy,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type PaletaGrafica,
  PALETA_VAR,
  mismaPaleta,
  paletaDelElemento,
} from "../../lib/tema/paleta";
import {
  ALTO_EJE_INCLINADO,
  ALTO_MINIMO,
  ANCHO_IMPRESION,
  anchoUtil,
  rotuloEje,
} from "./ejeGrafica";
import {
  type NombresRecorte,
  recortarCategorias,
  textoRecorte,
} from "./recorteCategorias";
import { useTema } from "../../store/useTema";
import { useImprimiendo } from "./contextoImpresion";
import { cargarGraficas } from "./cargaGraficas";
import {
  type PuntosGrafica,
  type SerieGrafica,
  type TipoGrafica,
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
  recorte,
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
  /**
   * Solo para ejes de CATEGORIAS. Cuando se pasa, la grafica recorta a las
   * categorias que caben legibles y escribe al pie cuantas quedaron fuera y
   * que proporcion pesan. Los puntos deben llegar ya ordenados por `por`.
   *
   * Sin esta prop no se recorta nada: un eje de tiempo no se recorta nunca, y
   * una grafica de pocas categorias tampoco lo necesita.
   */
  readonly recorte?: NombresRecorte & {
    /** Clave de la serie que ordena y que se mide. */
    readonly por: string;
  };
}) {
  const imprimiendo = useImprimiendo();
  const [figura, paleta] = usePaleta();
  const ancho = useAncho(figura);

  // El recorte va ANTES de traducir a filas: lo que no se dibuja tampoco se
  // calcula, y las etiquetas del eje tienen que corresponder con las barras.
  const recortado = useMemo(() => {
    if (recorte === undefined || !esCategorica(puntos)) {
      return { visibles: puntos, nota: null };
    }
    const r = recortarCategorias(puntos, {
      anchoDisponible: anchoUtil(imprimiendo ? ANCHO_IMPRESION : ancho),
      series: series.length,
      clave: recorte.por,
      // En papel nunca se recorta: el ancho es fijo y conocido, y el reporte
      // impreso no debe depender del ancho que tuviera la ventana al imprimir.
      sinRecorte: imprimiendo,
    });
    return { visibles: r.visibles, nota: textoRecorte(r, recorte) };
  }, [puntos, series.length, recorte, ancho, imprimiendo]);

  const visibles = recortado.visibles;
  const filas = useMemo(() => filasRecharts(visibles, series), [visibles, series]);
  const etiquetas = useMemo(() => etiquetasEje(visibles), [visibles]);

  // Con las etiquetas inclinadas hay que dar mas alto, o el eje se come el area
  // de dibujo y las barras quedan aplastadas justo cuando menos espacio hay.
  const inclinado =
    rotuloEje({ ancho, categorias: filas.length, categorica: esCategorica(visibles) }).angulo !== 0;
  const altoUtil = Math.max(ALTO_MINIMO, alto) + (inclinado && !imprimiendo ? ALTO_EJE_INCLINADO - 30 : 0);

  if (filas.length === 0) {
    return (
      <p className="border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
        {vacio}
      </p>
    );
  }

  return (
    <figure ref={figura} className="imp-bloque m-0" aria-label={etiqueta}>
      <Leyenda series={series} linea={tipo === "linea"} paleta={paleta} />
      <BarreraGrafica alto={altoUtil}>
        <Suspense fallback={<Reserva alto={altoUtil} texto="Cargando la gráfica…" />}>
          <Lienzo
            tipo={tipo}
            series={series}
            filas={filas}
            etiquetas={etiquetas}
            categorica={esCategorica(visibles)}
            imprimiendo={imprimiendo}
            alto={altoUtil}
            ancho={ancho}
            paleta={paleta}
          />
        </Suspense>
      </BarreraGrafica>
      {recortado.nota !== null && (
        <figcaption className="mt-1 text-[11px] leading-snug text-slate-500">
          {recortado.nota}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * La paleta del tema que rige DONDE ESTA LA GRAFICA, no la del documento.
 *
 * Se recalcula cuando cambia el tema resuelto y cuando la figura entra o sale
 * de la vista imprimible: esa vista fuerza claro en su subarbol, asi que la
 * misma grafica tiene colores distintos en pantalla y en papel, y los dos
 * salen de leer el elemento real.
 *
 * `useLayoutEffect` y no `useEffect` para que la paleta correcta este puesta
 * antes del primer pintado y no se vea un parpadeo de color al cambiar de tema.
 *
 * Se llama `usePaleta` y no `usarPaleta`, unico anglicismo del proyecto: la
 * regla `rules-of-hooks` identifica los hooks por el prefijo "use", y un nombre
 * en español la deja sin poder vigilar este archivo.
 */
function usePaleta(): [RefObject<HTMLElement | null>, PaletaGrafica] {
  const figura = useRef<HTMLElement | null>(null);
  const resuelto = useTema((s) => s.resuelto);
  const imprimiendo = useImprimiendo();
  const [estado, setEstado] = useState<{ clave: string; paleta: PaletaGrafica }>({
    clave: "",
    paleta: PALETA_VAR,
  });

  useLayoutEffect(() => {
    // La clave nombra el CONTEXTO de color en el que esta la figura. Son las
    // dos unicas cosas que pueden cambiar los tokens que hereda: el tema de la
    // pantalla, y si esta o no dentro de la vista imprimible, que fuerza claro.
    // Guardarla evita releer el DOM en cada pintado sin perderse un cambio.
    const clave = `${imprimiendo ? "impresion" : "pantalla"}:${resuelto}`;
    setEstado((previo) => {
      if (previo.clave === clave) return previo;
      const paleta = paletaDelElemento(figura.current);
      return mismaPaleta(previo.paleta, paleta) ? { clave, paleta: previo.paleta } : { clave, paleta };
    });
  }, [resuelto, imprimiendo]);

  return [figura, estado.paleta];
}

/**
 * Ancho real de la figura, en pixeles.
 *
 * Hace falta para decidir como se rotula el eje X, y no se puede deducir del
 * ancho de la ventana: la misma grafica puede estar en media pantalla, en una
 * columna compartida o en la hoja impresa. Se mide el elemento.
 */
function useAncho(figura: RefObject<HTMLElement | null>): number {
  const [ancho, setAncho] = useState(0);

  useLayoutEffect(() => {
    const el = figura.current;
    if (el === null || typeof ResizeObserver !== "function") return;
    const observador = new ResizeObserver(() => {
      const medido = Math.round(el.getBoundingClientRect().width);
      setAncho((previo) => (previo === medido ? previo : medido));
    });
    observador.observe(el);
    return () => {
      observador.disconnect();
    };
  }, [figura]);

  return ancho;
}

/** Espacio del mismo alto que la grafica, mientras llega o si no llego. */
function Reserva({ alto, texto, error = false }: { alto: number; texto: string; error?: boolean }) {
  return (
    <div
      style={{ height: alto }}
      className={clsx(
        "flex items-center justify-center border border-dashed text-[11px]",
        error ? "border-riesgo/40 text-riesgo" : "border-slate-200 text-slate-500",
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
function Leyenda({
  series,
  linea,
  paleta,
}: {
  series: readonly SerieGrafica[];
  linea: boolean;
  paleta: PaletaGrafica;
}) {
  return (
    <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
      {series.map((s) => (
        <li key={s.clave} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={clsx("inline-block shrink-0", linea ? "h-0.5 w-4" : "h-2.5 w-2.5")}
            style={{ backgroundColor: paleta[s.color] }}
          />
          {s.etiqueta}
        </li>
      ))}
    </ul>
  );
}
