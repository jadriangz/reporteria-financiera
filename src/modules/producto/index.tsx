import { type ReactNode, useMemo } from "react";

import { Callout } from "../../components/ui/Callout";
import { Grafica } from "../../components/ui/Grafica";
import { TablaCifras } from "../../components/ui/TablaCifras";
import { RejillaKPI, TarjetaKPI } from "../../components/ui/TarjetaKPI";
import { Seccion } from "../../components/ui/primitivas";
import type { ColumnaTabla } from "../../components/ui/tabla";
import { entero, moneda, porcentaje } from "../../lib/format";
import type { Calculos } from "../../store/useAppStore";
import {
  type FilaProducto,
  SERIES_PRODUCTO,
  filasProducto,
  RECORTE_MODELOS,
  puntosProducto,
  totalProducto,
} from "./selectores";

/**
 * Modulo 5 — Rendimiento por producto.
 *
 * Lee del store y no calcula: los grupos linea -> modelo y sus subtotales los
 * arma el motor (`producto.ts`); `selectores.ts` solo los aplana en renglones.
 */
export function ModuloProducto({ calculos }: { calculos: Calculos }) {
  const { producto, resultados } = calculos;
  const margenUniforme = calculos.insights.find((i) => i.id === "margen-derivado");
  const puntos = useMemo(() => puntosProducto(producto), [producto]);

  return (
    <div>
      {margenUniforme !== undefined && (
        <div className="mb-4">
          <Callout titulo={margenUniforme.titulo} tono={margenUniforme.nivel}>
            {margenUniforme.detalle}
          </Callout>
        </div>
      )}

      <Indicadores calculos={calculos} />

      <Seccion
        titulo="Por línea y modelo"
        descripcion="Cada línea con sus modelos, de mayor a menor ingreso, y su subtotal."
      >
        <TablaProducto calculos={calculos} />
      </Seccion>

      <Seccion titulo="Ingreso contra utilidad por modelo" descripcion="Utilidad bruta: venta menos costo.">
        <Grafica
          tipo="barras"
          series={SERIES_PRODUCTO}
          puntos={puntos}
          etiqueta="Ingreso y utilidad bruta por modelo"
          vacio="No hay ventas computables que graficar."
          recorte={{ ...RECORTE_MODELOS, dondeVerElResto: "en la tabla de arriba" }}
        />
        {resultados.excluidas.length > 0 && (
          <Nota>
            No incluye{" "}
            {resultados.excluidas.map((e, i) => (
              <span key={e.venta.folio}>
                {i > 0 && "; "}
                <span className="cifras">{e.venta.folio}</span> ({e.explicacion})
              </span>
            ))}
          </Nota>
        )}
      </Seccion>
    </div>
  );
}

// --------------------------- B5.1: indicadores ---------------------------

function Indicadores({ calculos }: { calculos: Calculos }) {
  const { total } = calculos.resultados;
  return (
    <RejillaKPI>
      <TarjetaKPI
        etiqueta="Unidades"
        valor={entero(total.operaciones)}
        nota="Una por operación: la plantilla no captura cantidad por fila."
      />
      <TarjetaKPI etiqueta="Ingreso" valor={moneda(total.ventaTotal)} nota="Ventas computables del periodo." />
      <TarjetaKPI
        etiqueta="Utilidad bruta"
        valor={moneda(total.utilidadBruta)}
        tono={total.utilidadBruta < 0 ? "riesgo" : "neutro"}
        nota={`Sobre un costo de ${moneda(total.costoTotal)}.`}
      />
      <TarjetaKPI
        etiqueta="Margen agregado"
        valor={porcentaje(total.margenPct)}
        tono={total.margenPct !== null && total.margenPct < 0 ? "riesgo" : "neutro"}
        nota={
          total.margenPct === null
            ? "Sin venta contra la cual medir."
            : "Utilidad bruta entre ingreso, todas las líneas juntas."
        }
      />
    </RejillaKPI>
  );
}

// --------------------------- B5.2: tabla ---------------------------

/** Sin `ordenar`: reordenar separaria los modelos de su subtotal. */
const COLUMNAS_PRODUCTO: readonly ColumnaTabla<FilaProducto>[] = [
  { clave: "linea", encabezado: "Línea", celda: (f) => f.linea, ancho: "10rem" },
  { clave: "modelo", encabezado: "Modelo", celda: (f) => f.modelo ?? "" },
  {
    clave: "unidades",
    encabezado: "Unid.",
    alineacion: "derecha",
    celda: (f) => entero(f.unidades),
    ancho: "4rem",
  },
  { clave: "ingreso", encabezado: "Ingreso", alineacion: "derecha", celda: (f) => moneda(f.ingreso) },
  { clave: "costo", encabezado: "Costo", alineacion: "derecha", celda: (f) => moneda(f.costo) },
  {
    clave: "utilidad",
    encabezado: "Utilidad",
    alineacion: "derecha",
    celda: (f) => moneda(f.utilidadBruta),
  },
  {
    clave: "margen",
    encabezado: "Margen",
    alineacion: "derecha",
    celda: (f) => porcentaje(f.margenPct),
    ancho: "5rem",
  },
  {
    clave: "participacion",
    encabezado: "% del ingreso",
    alineacion: "derecha",
    celda: (f) => porcentaje(f.participacion),
    ancho: "6rem",
  },
];

function TablaProducto({ calculos }: { calculos: Calculos }) {
  const filas = useMemo(() => filasProducto(calculos.producto), [calculos.producto]);
  return (
    <TablaCifras
      etiquetaTabla="Rendimiento por línea y modelo"
      columnas={COLUMNAS_PRODUCTO}
      filas={filas.map((f) => ({
        id: f.id,
        datos: f,
        enfasis: f.enfasis,
        tono: f.utilidadBruta < 0 ? ("riesgo" as const) : ("neutro" as const),
      }))}
      totales={{ id: "total", datos: totalProducto(calculos.resultados.total) }}
      vacio="No hay ventas computables."
    />
  );
}

// --------------------------- apoyo ---------------------------

function Nota({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[11px] leading-snug text-slate-500">{children}</p>;
}
