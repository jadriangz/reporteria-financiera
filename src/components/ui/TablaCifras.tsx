import clsx from "clsx";
import { type ReactNode, useMemo, useState } from "react";

import { FilaExpandible } from "./FilaExpandible";
import { useImprimiendo } from "./contextoImpresion";
import {
  type ColumnaTabla,
  type FilaTabla,
  type OrdenTabla,
  TONO_FILA,
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
  readonly vacio?: ReactNode;
  readonly etiquetaTabla?: string;
}) {
  const [orden, setOrden] = useState<OrdenTabla | null>(ordenInicial ?? null);
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set());
  // En papel no hay clic: todo lo desplegable se imprime abierto y los
  // encabezados se imprimen como texto, sin boton ni flechas.
  const imprimiendo = useImprimiendo();

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

  const celdasDe = (fila: FilaTabla<T>): ReactNode =>
    columnas.map((c) => (
      <td
        key={c.clave}
        className={clsx(
          "px-2 py-1",
          c.alineacion === "derecha" ? "cifras text-right tabular-nums" : "text-left",
          TONO_TEXTO[fila.tono ?? "neutro"],
        )}
      >
        {c.celda(fila.datos)}
      </td>
    ));

  return (
    <div
      className={clsx(
        "overflow-x-auto print:overflow-visible",
        corta ? "imp-bloque" : "imp-tabla-larga",
      )}
    >
      <table className="w-full border-collapse text-xs" aria-label={etiquetaTabla}>
        <thead>
          <tr className="border-y border-slate-200 bg-slate-50">
            {hayDetalle && <th className="w-6" aria-label="Detalle" />}
            {columnas.map((c) => (
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
                )}
              >
                {c.ordenar === undefined || imprimiendo ? (
                  c.encabezado
                ) : (
                  <button
                    type="button"
                    onClick={() => setOrden((actual) => siguienteOrden(actual, c.clave))}
                    className={clsx(
                      "inline-flex items-center gap-1 hover:text-marino",
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
              {hayDetalle && <td />}
              {columnas.map((c) => (
                <td
                  key={c.clave}
                  className={clsx(
                    "px-2 py-1.5",
                    c.alineacion === "derecha" ? "cifras text-right tabular-nums" : "text-left",
                    TONO_TEXTO[totales.tono ?? "neutro"],
                  )}
                >
                  {c.celda(totales.datos)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
