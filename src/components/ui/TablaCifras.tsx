import clsx from "clsx";
import { type ReactNode, useMemo, useRef, useState } from "react";

import { FilaExpandible } from "./FilaExpandible";
import { useImprimiendo } from "./contextoImpresion";
import { useDesplazamientoHorizontal } from "./desplazamiento";
import {
  type ColumnaTabla,
  type EstrategiaEstrecha,
  type FilaTabla,
  type OrdenTabla,
  TONO_FILA,
  TONO_FILA_OPACO,
  TONO_TEXTO,
  ordenarFilas,
  siguienteOrden,
} from "./tabla";

/**
 * Hasta cuantos renglones una tabla se imprime entera en una hoja. Mas alla,
 * pedir que no se parta hace que el navegador la empuje completa a la hoja
 * siguiente y deje media hoja en blanco; es peor que partirla limpia.
 */
const RENGLONES_SIN_CORTE = 12;

/**
 * Tabla de cifras: el caballo de batalla del reporte.
 *
 * Hace cumplir por construccion las reglas que no queremos repetir en cada
 * modulo: texto a la izquierda, numeros a la derecha con `.cifras` (sin numeros
 * tabulares las columnas de importes no alinean y comparar dos cantidades deja
 * de ser posible de un vistazo), densidad alta y orden por cualquier columna.
 *
 * No sabe de negocio. Recibe filas ya calculadas y celdas ya formateadas.
 *
 * EN POCO ANCHO hace lo que le diga `enEstrecho`, y el modulo lo decide. No se
 * deduce del numero de columnas: una tabla de tres columnas puede ser de
 * detalle y una de seis puede ser de resumen; lo que manda es si sus renglones
 * se comparan entre si. Ver `EstrategiaEstrecha` en `tabla.ts`.
 *
 * El corte lo decide una CONSULTA DE CONTENEDOR, no el ancho de la ventana: la
 * misma tabla puede estar en una columna de 480 px dentro de una pantalla de
 * 1440, y lo que importa es el espacio que tiene, no el que tiene la pantalla.
 *
 * Nota de uso: defina el arreglo `columnas` FUERA del componente que la usa. Si
 * se construye en cada render, cambia de identidad y anula la memoizacion del
 * ordenamiento.
 */
export function TablaCifras<T>({
  columnas,
  filas,
  totales,
  ordenInicial,
  expandir,
  enEstrecho = "scroll",
  vacio = "Sin registros.",
  etiquetaTabla,
}: {
  readonly columnas: readonly ColumnaTabla<T>[];
  readonly filas: readonly FilaTabla<T>[];
  /** Fila de totales, siempre al pie y siempre visible. */
  readonly totales?: FilaTabla<T>;
  readonly ordenInicial?: OrdenTabla;
  /**
   * Si se pasa, cada fila puede desplegarse. Devolver `null` para una fila que
   * no tiene detalle que mostrar.
   */
  readonly expandir?: (fila: T) => ReactNode | null;
  /** Que hacer cuando no cabe a lo ancho. Por omision, conservar la tabla. */
  readonly enEstrecho?: EstrategiaEstrecha;
  readonly vacio?: ReactNode;
  readonly etiquetaTabla?: string;
}) {
  const [orden, setOrden] = useState<OrdenTabla | null>(ordenInicial ?? null);
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set());
  // En papel no hay clic: todo lo desplegable se imprime abierto y los
  // encabezados se imprimen como texto, sin boton ni flechas.
  const imprimiendo = useImprimiendo();
  const contenedor = useRef<HTMLDivElement | null>(null);
  const { desplazable, alFinal } = useDesplazamientoHorizontal(contenedor);

  const ordenadas = useMemo(() => ordenarFilas(filas, columnas, orden), [filas, columnas, orden]);

  const alternarFila = (id: string) => {
    setAbiertas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  };

  const hayDetalle = expandir !== undefined;
  // Al imprimir, una tabla corta no se parte; una larga se parte entre
  // renglones (nunca a media fila) y repite su encabezado. Ver index.css.
  const corta = ordenadas.length <= RENGLONES_SIN_CORTE && !(imprimiendo && hayDetalle);
  const anchoTotal = columnas.length + (hayDetalle ? 1 : 0);
  const fijarPrimera = enEstrecho === "scroll";
  // Con detalle desplegable hay una celda de control ANTES de la primera
  // columna: la fija se recorre ese ancho para no encimarse con la flecha.
  const izquierdaPrimera = hayDetalle ? "left-6" : "left-0";

  const celdasDe = (fila: FilaTabla<T>): ReactNode =>
    columnas.map((c, i) => (
      <td
        key={c.clave}
        className={clsx(
          "px-2 py-1",
          c.alineacion === "derecha" ? "cifras text-right tabular-nums" : "text-left",
          TONO_TEXTO[fila.tono ?? "neutro"],
          // La primera columna se queda quieta mientras el resto se desplaza:
          // sin ella, a la mitad del recorrido ya no se sabe de quien es la fila.
          i === 0 &&
            fijarPrimera && [
              "sticky z-10 print:static",
              izquierdaPrimera,
              TONO_FILA_OPACO[fila.tono ?? "neutro"],
              desplazable && "border-r border-slate-200",
            ],
        )}
      >
        {c.celda(fila.datos)}
      </td>
    ));

  const tabla = (
    <table className="w-full border-collapse text-xs" aria-label={etiquetaTabla}>
      <thead>
        <tr className="border-y border-slate-200 bg-slate-50">
          {hayDetalle && (
            <th
              className={clsx("w-6", fijarPrimera && "sticky left-0 z-20 bg-slate-50 print:static")}
              aria-label="Detalle"
            />
          )}
          {columnas.map((c, i) => (
            <th
              key={c.clave}
              scope="col"
              title={c.titulo}
              style={c.ancho === undefined ? undefined : { width: c.ancho }}
              aria-sort={
                orden?.clave === c.clave
                  ? orden.direccion === "asc"
                    ? "ascending"
                    : "descending"
                  : undefined
              }
              className={clsx(
                "px-2 py-1.5 font-semibold text-slate-600",
                c.alineacion === "derecha" ? "text-right" : "text-left",
                i === 0 &&
                  fijarPrimera && [
                    "sticky z-20 bg-slate-50 print:static",
                    izquierdaPrimera,
                  ],
              )}
            >
              {c.ordenar === undefined || imprimiendo ? (
                c.encabezado
              ) : (
                <button
                  type="button"
                  onClick={() => setOrden((actual) => siguienteOrden(actual, c.clave))}
                  className={clsx(
                    // `toque-denso`: con raton se queda compacto; con dedo
                    // crece a 44 px y el renglon con el. Ver index.css.
                    "toque-denso inline-flex items-center justify-center gap-1 hover:text-marino",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marino",
                    orden?.clave === c.clave && "text-marino",
                  )}
                >
                  {c.encabezado}
                  <span aria-hidden="true" className="text-[9px] text-slate-400">
                    {orden?.clave === c.clave ? (orden.direccion === "asc" ? "▲" : "▼") : "⇅"}
                  </span>
                </button>
              )}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {ordenadas.length === 0 ? (
          <tr>
            <td colSpan={anchoTotal} className="px-2 py-6 text-center text-slate-500">
              {vacio}
            </td>
          </tr>
        ) : (
          ordenadas.map((fila) =>
            hayDetalle ? (
              <FilaExpandible
                key={fila.id}
                celdas={celdasDe(fila)}
                detalle={expandir(fila.datos)}
                columnas={columnas.length}
                tono={fila.tono ?? "neutro"}
                enfasis={fila.enfasis ?? "normal"}
                abierta={imprimiendo || abiertas.has(fila.id)}
                onAlternar={() => alternarFila(fila.id)}
                {...(fijarPrimera
                  ? {
                      celdaControl: clsx(
                        "sticky left-0 z-10 print:static",
                        TONO_FILA_OPACO[fila.tono ?? "neutro"],
                      ),
                    }
                  : {})}
              />
            ) : (
              <tr
                key={fila.id}
                className={clsx(
                  "border-b border-slate-100",
                  TONO_FILA[fila.tono ?? "neutro"],
                  fila.enfasis === "total" && "font-semibold",
                  fila.enfasis === "subtotal" && "font-medium",
                )}
              >
                {celdasDe(fila)}
              </tr>
            ),
          )
        )}
      </tbody>

      {totales !== undefined && (
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
            {hayDetalle && (
              <td className={clsx(fijarPrimera && "sticky left-0 z-10 bg-slate-50 print:static")} />
            )}
            {columnas.map((c, i) => (
              <td
                key={c.clave}
                className={clsx(
                  "px-2 py-1.5",
                  c.alineacion === "derecha" ? "cifras text-right tabular-nums" : "text-left",
                  TONO_TEXTO[totales.tono ?? "neutro"],
                  i === 0 &&
                    fijarPrimera && ["sticky z-10 bg-slate-50 print:static", izquierdaPrimera],
                )}
              >
                {c.celda(totales.datos)}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );

  return (
    <div className={clsx("@container", corta ? "imp-bloque" : "imp-tabla-larga")}>
      <div
        className={clsx(
          "relative",
          // Con tarjetas, la tabla solo existe a partir de 28rem de contenedor.
          enEstrecho === "tarjetas" && "hidden @md:block print:block",
        )}
      >
        <div
          ref={contenedor}
          // `region` con nombre y `tabindex` es lo que hace que un contenedor
          // desplazable sea alcanzable con el teclado: sin esto, a la parte
          // derecha de la tabla solo se llega con el raton.
          {...(desplazable && !imprimiendo
            ? { role: "region", tabIndex: 0, "aria-label": etiquetaTabla ?? "Tabla desplazable" }
            : {})}
          className="overflow-x-auto print:overflow-visible focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marino"
        >
          {tabla}
        </div>

        {/*
          El degradado dice "sigue"; la nota de abajo dice CUANTO y COMO. Los
          dos, porque el degradado no existe para un lector de pantalla.
        */}
        {desplazable && !alFinal && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-papel to-transparent print:hidden"
          />
        )}
        {desplazable && (
          <p className="mt-1 text-[11px] text-slate-500 print:hidden">
            Tabla de {columnas.length} columnas: no cabe completa a lo ancho.{" "}
            {alFinal ? "Está viendo el final." : "Deslice hacia la derecha para ver el resto."} La
            primera columna se queda fija.
          </p>
        )}
      </div>

      {enEstrecho === "tarjetas" && (
        <TarjetasDeFilas
          columnas={columnas}
          filas={ordenadas}
          totales={totales}
          vacio={vacio}
          etiquetaTabla={etiquetaTabla}
        />
      )}
    </div>
  );
}

/**
 * La misma tabla de resumen, un renglon por tarjeta.
 *
 * Solo para tablas cuyos renglones NO se comparan entre si: aqui cada concepto
 * se lee solo, con su etiqueta pegada a su valor. Se renderiza siempre y se
 * oculta con la consulta de contenedor en vez de decidirlo en JavaScript:
 * medir en JavaScript obliga a pintar primero y corregir despues, y eso se ve.
 *
 * Son pocas filas por definicion —una cascada tiene siete—, asi que duplicar
 * ese marcado no cuesta nada. Lo oculto sale del arbol de accesibilidad, asi
 * que un lector de pantalla encuentra una sola version, no dos.
 */
function TarjetasDeFilas<T>({
  columnas,
  filas,
  totales,
  vacio,
  etiquetaTabla,
}: {
  readonly columnas: readonly ColumnaTabla<T>[];
  readonly filas: readonly FilaTabla<T>[];
  readonly totales: FilaTabla<T> | undefined;
  readonly vacio: ReactNode;
  readonly etiquetaTabla: string | undefined;
}) {
  const [primera, ...resto] = columnas;
  if (primera === undefined) return null;

  const tarjeta = (fila: FilaTabla<T>, esTotal: boolean) => (
    <li
      key={fila.id}
      className={clsx(
        "border border-slate-200 px-2 py-1.5",
        TONO_FILA[fila.tono ?? "neutro"],
        esTotal && "border-t-2 border-t-slate-300 bg-slate-50",
      )}
    >
      <p
        className={clsx(
          "text-xs",
          TONO_TEXTO[fila.tono ?? "neutro"],
          fila.enfasis === "normal" || fila.enfasis === undefined ? "font-medium" : "font-semibold",
        )}
      >
        {primera.celda(fila.datos)}
      </p>
      <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
        {resto.map((c) => (
          <div key={c.clave} className="contents">
            <dt className="text-[11px] text-slate-500">{c.encabezado}</dt>
            <dd
              className={clsx(
                "cifras text-right text-xs tabular-nums",
                TONO_TEXTO[fila.tono ?? "neutro"],
              )}
            >
              {c.celda(fila.datos)}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );

  return (
    <ul
      aria-label={etiquetaTabla}
      className="space-y-1.5 @md:hidden print:hidden"
    >
      {filas.length === 0 ? (
        <li className="border border-dashed border-slate-300 px-2 py-6 text-center text-xs text-slate-500">
          {vacio}
        </li>
      ) : (
        filas.map((f) => tarjeta(f, false))
      )}
      {totales !== undefined && tarjeta(totales, true)}
    </ul>
  );
}
