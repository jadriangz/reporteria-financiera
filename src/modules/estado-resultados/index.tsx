import clsx from "clsx";
import { type ReactNode, useMemo } from "react";

import { Callout, type TonoCallout } from "../../components/ui/Callout";
import { TablaCifras } from "../../components/ui/TablaCifras";
import { RejillaKPI, TarjetaKPI } from "../../components/ui/TarjetaKPI";
import { Cifra, Seccion } from "../../components/ui/primitivas";
import type { ColumnaTabla } from "../../components/ui/tabla";
import { type ClaveMes, SIN_FECHA } from "../../lib/calc";
import { entero, mes as fmtMes, moneda, porcentaje } from "../../lib/format";
import { type Calculos, useAppStore } from "../../store/useAppStore";
import { TablaEscenarios } from "../cobranza/TablaEscenarios";
import { TablaCascada } from "./TablaCascada";
import {
  type FilaCascadaMensual,
  type FilaGasto,
  type LecturaEquilibrio,
  type MotivoSinEquilibrio,
  type SubcategoriaGasto,
  TEXTO_SIN_EQUILIBRIO,
  cascadaMensual,
  desgloseGastos,
  filaTotalGastos,
  filasGastos,
  leerEquilibrio,
} from "./selectores";

/**
 * Hallazgos del motor que pertenecen a este modulo, en el orden en que se
 * pintan. El de IVA va primero: condiciona la lectura de todas las cifras.
 */
const INSIGHTS_DE_RESULTADOS = ["importes-iva", "punto-equilibrio", "margen-derivado", "ventas-sin-fecha"];

/**
 * Modulo 2 — Estado de resultados.
 *
 * Lee del store y no calcula: la cascada viene del motor, y el signo contable,
 * el eje mensual y el desglose de gastos de `selectores.ts`.
 */
export function ModuloEstadoResultados({ calculos }: { calculos: Calculos }) {
  const { resultados } = calculos;
  const insights = INSIGHTS_DE_RESULTADOS.flatMap((id) =>
    calculos.insights.filter((i) => i.id === id),
  );

  return (
    <div>
      {insights.length > 0 && (
        <div className="mb-4 space-y-2">
          {insights.map((i) => (
            <Callout key={i.id} titulo={i.titulo} tono={i.nivel}>
              {i.detalle}
            </Callout>
          ))}
        </div>
      )}

      <Seccion
        titulo="Cascada del periodo"
        descripcion="De la venta al resultado, con los gastos capturados en la hoja gastos."
      >
        <CascadaPeriodo calculos={calculos} />
      </Seccion>

      <Seccion
        titulo="Mes por mes"
        descripcion="La misma cascada por mes. Lo que no tiene fecha va en su propia columna, nunca repartido."
      >
        <CascadaPorMes calculos={calculos} />
      </Seccion>

      <Seccion
        titulo="Gastos operativos"
        descripcion="Por categoría, separando fijos de variables. Despliegue una categoría para ver sus subcategorías."
      >
        <DesgloseDeGastos />
      </Seccion>

      <Seccion
        titulo="Punto de equilibrio"
        descripcion="Venta mensual necesaria para cubrir los gastos fijos, contra la venta promedio real."
      >
        <PuntoEquilibrio lectura={leerEquilibrio(resultados)} />
      </Seccion>

      <Seccion
        titulo="Utilidad ajustada por riesgo de cartera"
        descripcion="Provisión por incobrabilidad sobre la cartera vencida. Las tasas son las que se ajustan en Cobranza."
      >
        <Escenarios calculos={calculos} />
      </Seccion>
    </div>
  );
}

// --------------------------- M2.1: cascada ---------------------------

function CascadaPeriodo({ calculos }: { calculos: Calculos }) {
  const { resultados } = calculos;

  return (
    <div className="max-w-2xl">
      <TablaCascada cascada={resultados.total} />
      <Nota>
        El resultado resta únicamente los gastos capturados: no es utilidad neta auditada. No
        incluye impuestos, depreciación ni gastos que falten por capturar.
      </Nota>
      {resultados.excluidas.length > 0 && (
        <Nota>
          Fuera de la cascada:{" "}
          {resultados.excluidas.map((e, i) => (
            <span key={e.venta.folio}>
              {i > 0 && "; "}
              <span className="cifras">{e.venta.folio}</span> ({e.explicacion})
            </span>
          ))}
        </Nota>
      )}
    </div>
  );
}

// --------------------------- M2.2: mensual ---------------------------

/** Un cero se atenua: en una rejilla mensual, el ojo debe ir a las cifras reales. */
function Importe({ valor, sinFecha = false }: { valor: number; sinFecha?: boolean }) {
  return (
    <span className={clsx(valor === 0 ? "text-slate-400" : sinFecha && "text-advertencia")}>
      {moneda(valor)}
    </span>
  );
}

const TITULO_SIN_FECHA =
  "Ventas y gastos sin fecha capturada: no pueden ubicarse en ningún mes y se muestran aparte.";

function columnasMensuales(meses: readonly ClaveMes[]): ColumnaTabla<FilaCascadaMensual>[] {
  return [
    { clave: "concepto", encabezado: "Concepto", celda: (f) => f.concepto, ancho: "13rem" },
    ...meses.map(
      (m): ColumnaTabla<FilaCascadaMensual> => ({
        clave: m,
        encabezado: fmtMes(m),
        alineacion: "derecha",
        celda: (f) => <Importe valor={f.porMes[m] ?? 0} sinFecha={m === SIN_FECHA} />,
        ...(m === SIN_FECHA ? { titulo: TITULO_SIN_FECHA } : {}),
      }),
    ),
    {
      clave: "total",
      encabezado: "Total",
      alineacion: "derecha",
      celda: (f) => <span className="font-semibold">{moneda(f.total)}</span>,
    },
  ];
}

function CascadaPorMes({ calculos }: { calculos: Calculos }) {
  const mensual = useMemo(() => cascadaMensual(calculos.resultados), [calculos.resultados]);
  const columnas = useMemo(() => columnasMensuales(mensual.columnas), [mensual.columnas]);

  return (
    <TablaCifras
      etiquetaTabla="Estado de resultados por mes"
      columnas={columnas}
      filas={mensual.filas.map((f) => ({
        id: f.clave,
        datos: f,
        enfasis: f.enfasis,
        tono: f.tono,
      }))}
    />
  );
}

// --------------------------- M2.3: gastos ---------------------------

const COLUMNAS_GASTOS: readonly ColumnaTabla<FilaGasto>[] = [
  {
    clave: "concepto",
    encabezado: "Categoría",
    celda: (f) => (f.nivel === "categoria" ? <span className="pl-3">{f.nombre}</span> : f.nombre),
  },
  {
    clave: "registros",
    encabezado: "Registros",
    alineacion: "derecha",
    celda: (f) => entero(f.registros),
    ancho: "5rem",
  },
  {
    clave: "monto",
    encabezado: "Importe",
    alineacion: "derecha",
    celda: (f) => moneda(f.monto),
    ancho: "9rem",
  },
  {
    clave: "pct",
    encabezado: "% del total",
    alineacion: "derecha",
    celda: (f) => porcentaje(f.pctTotal),
    ancho: "6rem",
  },
];

const COLUMNAS_SUBCATEGORIAS: readonly ColumnaTabla<SubcategoriaGasto>[] = [
  { clave: "nombre", encabezado: "Subcategoría", celda: (s) => s.nombre },
  {
    clave: "registros",
    encabezado: "Registros",
    alineacion: "derecha",
    celda: (s) => entero(s.registros),
    ancho: "5rem",
  },
  {
    clave: "monto",
    encabezado: "Importe",
    alineacion: "derecha",
    celda: (s) => moneda(s.monto),
    ancho: "9rem",
  },
  {
    clave: "pct",
    encabezado: "% de la categoría",
    alineacion: "derecha",
    celda: (s) => porcentaje(s.pctCategoria),
    ancho: "7rem",
  },
];

function DesgloseDeGastos() {
  const gastos = useAppStore((s) => s.dataset?.gastos);
  const desglose = useMemo(() => desgloseGastos(gastos ?? []), [gastos]);

  return (
    <div className="max-w-3xl">
      <TablaCifras
        etiquetaTabla="Gastos por categoría"
        columnas={COLUMNAS_GASTOS}
        filas={filasGastos(desglose).map((f) => ({
          id: f.id,
          datos: f,
          enfasis: f.nivel === "grupo" ? ("subtotal" as const) : ("normal" as const),
        }))}
        totales={{ id: "total", datos: filaTotalGastos(desglose) }}
        expandir={(f) =>
          f.subcategorias.length === 0 ? null : (
            <TablaCifras
              etiquetaTabla={`Subcategorías de ${f.nombre}`}
              columnas={COLUMNAS_SUBCATEGORIAS}
              filas={f.subcategorias.map((s) => ({ id: s.clave, datos: s }))}
            />
          )
        }
        vacio="No hay gastos capturados."
      />
      {desglose.sinMonto > 0 && (
        <Nota>
          {desglose.sinMonto === 1
            ? "1 registro de gastos no tiene monto capturado y no se incluye."
            : `${entero(desglose.sinMonto)} registros de gastos no tienen monto capturado y no se incluyen.`}
        </Nota>
      )}
      {desglose.sinTipo > 0 && (
        <Nota>
          {desglose.sinTipo === 1
            ? "1 registro no tiene tipo Fijo o Variable reconocible y se cuenta como fijo, igual que en la cascada."
            : `${entero(desglose.sinTipo)} registros no tienen tipo Fijo o Variable reconocible y se cuentan como fijos, igual que en la cascada.`}
        </Nota>
      )}
    </div>
  );
}

// --------------------------- M2.4: equilibrio ---------------------------

/** Que tan grave es cada motivo de no poder calcular. */
const TONO_SIN_EQUILIBRIO: Readonly<Record<MotivoSinEquilibrio, TonoCallout>> = {
  "sin-gastos-fijos": "advertencia",
  "sin-venta": "nota",
  "margen-no-positivo": "alerta",
  "sin-fechas": "nota",
};

function PuntoEquilibrio({ lectura }: { lectura: LecturaEquilibrio }) {
  if (lectura.periodo === null) {
    const motivo = lectura.motivo ?? "margen-no-positivo";
    return (
      <Callout titulo="No hay punto de equilibrio que calcular" tono={TONO_SIN_EQUILIBRIO[motivo]}>
        {TEXTO_SIN_EQUILIBRIO[motivo]}
      </Callout>
    );
  }

  const cubre = lectura.holgura !== null && lectura.holgura >= 0;
  const sinMeses = lectura.motivo === "sin-fechas";

  return (
    <>
      <RejillaKPI>
        <TarjetaKPI
          etiqueta="Equilibrio mensual"
          valor={lectura.mensual === null ? null : moneda(lectura.mensual)}
          nota={
            sinMeses ? (
              TEXTO_SIN_EQUILIBRIO["sin-fechas"]
            ) : (
              <>
                Gastos fijos de <Cifra tono="tenue">{moneda(lectura.gastosFijosMensuales)}</Cifra> al
                mes ÷ margen de contribución de{" "}
                <Cifra tono="tenue">{porcentaje(lectura.margenContribucion)}</Cifra>.
              </>
            )
          }
        />
        <TarjetaKPI
          etiqueta="Venta promedio mensual"
          valor={lectura.ventaPromedioMensual === null ? null : moneda(lectura.ventaPromedioMensual)}
          nota={
            sinMeses
              ? "Sin meses fechados no hay promedio."
              : `Venta del periodo entre ${entero(lectura.meses)} ${lectura.meses === 1 ? "mes" : "meses"}, los de la vista mensual.`
          }
        />
        <TarjetaKPI
          etiqueta="Holgura mensual"
          valor={lectura.holgura === null ? null : moneda(lectura.holgura)}
          tono={lectura.holgura === null ? "neutro" : cubre ? "positivo" : "riesgo"}
          nota={
            lectura.holgura === null
              ? "Requiere el equilibrio y la venta expresados por mes."
              : cubre
                ? "La venta promedio cubre los gastos fijos."
                : "Lo que falta cada mes para cubrir los gastos fijos."
          }
        />
        <TarjetaKPI
          etiqueta="Equilibrio del periodo"
          valor={moneda(lectura.periodo)}
          nota="Gastos fijos del periodo ÷ margen de contribución."
        />
      </RejillaKPI>
      <Nota>
        Solo cuenta los gastos capturados con tipo Fijo. Si faltan gastos por capturar, el punto de
        equilibrio real es más alto.
      </Nota>
    </>
  );
}

// --------------------------- M2.5: escenarios ---------------------------

function Escenarios({ calculos }: { calculos: Calculos }) {
  if (!calculos.capacidades.cobranza) {
    return (
      <Callout titulo="Escenarios no disponibles" tono="nota">
        Requieren la hoja cobranza. Sin abonos capturados, toda la venta aparecería como cartera
        pendiente y la provisión no significaría nada.
      </Callout>
    );
  }

  return (
    <div className="max-w-3xl">
      <TablaEscenarios
        porBucket={calculos.cartera.aging.porBucket}
        utilidadContribucion={calculos.resultados.total.utilidadContribucion}
      />
      <Nota>
        La utilidad ajustada es la utilidad de contribución menos la provisión, antes de gastos
        operativos. Los cuatro escenarios son referencias fijas; la fila resaltada, «Tasas
        aplicadas», sigue a los controles de Cobranza.
      </Nota>
    </div>
  );
}

// --------------------------- apoyo ---------------------------

function Nota({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[11px] leading-snug text-slate-500">{children}</p>;
}
