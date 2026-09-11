import { type ReactNode, useMemo } from "react";

import { Callout } from "../../components/ui/Callout";
import { Grafica } from "../../components/ui/Grafica";
import { TablaCifras } from "../../components/ui/TablaCifras";
import { RejillaKPI, TarjetaKPI } from "../../components/ui/TarjetaKPI";
import { Cifra, Seccion } from "../../components/ui/primitivas";
import type { ColumnaTabla } from "../../components/ui/tabla";
import type { Flujo } from "../../lib/calc";
import { entero, fechaCorta, mes as fmtMes, moneda, porcentaje } from "../../lib/format";
import type { Calculos } from "../../store/useAppStore";
import { NotaFueraDelEje } from "./NotaFueraDelEje";
import {
  type FilaMesFlujo,
  type FueraDelEje,
  SERIES_ACUMULADAS,
  SERIES_MENSUALES,
  brechaFinal,
  filasMensualesFlujo,
  indicadoresFlujo,
  puntosAcumulados,
  puntosMensuales,
  tonoConversion,
  totalFlujo,
} from "./selectores";

/** Hallazgos del motor que describen la estacionalidad, en orden de lectura. */
const INSIGHTS_DE_ESTACIONALIDAD = ["meses-sin-venta", "mes-pico"];

/**
 * Modulo 3 — Ventas y flujo.
 *
 * La tesis del modulo es que facturar y cobrar son dos calendarios distintos:
 * lo facturado se fecha por `ventas.fecha` y lo cobrado por
 * `cobranza.fecha_pago`, el dia en que el dinero entro de verdad. La diferencia
 * entre las dos series ES el contenido.
 *
 * Por que el modulo se deshabilita sin fechas de pago: sin `fecha_pago`, todo
 * lo cobrado cae en el grupo "sin fecha" y la grafica mostraria cero cobranza
 * todos los meses. La salida del reporte preliminar, que atribuia cada abono al
 * mes de la venta, dibuja el avance de cobro de cada mes de venta, no un flujo
 * de efectivo; pintarla aqui bajo el nombre "flujo" le mostraria al socio un
 * dinero que no sabemos cuando entro. Por eso `capacidades().flujo` exige al
 * menos un abono con fecha y el shell (`App.tsx`) pinta en su lugar el aviso de
 * que falta capturar. El archivo demo cae en ese caso: ninguno de sus abonos
 * trae fecha, y la prueba "el archivo demo" de `selectores.test.ts` lo fija.
 *
 * Con fechas parciales el modulo si se pinta: lo que no tiene fecha va en la
 * fila "Sin fecha" de la tabla y se nombra bajo cada grafica.
 */
export function ModuloVentasFlujo({ calculos }: { calculos: Calculos }) {
  const { flujo } = calculos;
  const mensuales = useMemo(() => puntosMensuales(flujo), [flujo]);
  const acumulados = useMemo(() => puntosAcumulados(flujo), [flujo]);

  return (
    <div>
      <Indicadores flujo={flujo} fuera={mensuales.fueraDelEje} />

      <Seccion
        titulo="Facturado contra cobrado por mes"
        descripcion="Lo facturado por fecha de venta; lo cobrado por fecha de pago real."
      >
        <Grafica
          tipo="barras"
          series={SERIES_MENSUALES}
          puntos={mensuales.puntos}
          etiqueta="Facturado y cobrado por mes"
          vacio="No hay meses con fecha que graficar."
        />
        <Nota>
          Son dos calendarios: un mes puede cobrar más de lo que factura porque recibe pagos de
          ventas anteriores, y un mes de mucha venta puede no cobrar casi nada.
        </Nota>
        <NotaFueraDelEje fuera={mensuales.fueraDelEje} />
      </Seccion>

      <Seccion titulo="Detalle mensual" descripcion="Una fila por mes del periodo, con los meses sin actividad.">
        <TablaMensual calculos={calculos} />
      </Seccion>

      <Seccion titulo="Estacionalidad">
        <Estacionalidad calculos={calculos} />
      </Seccion>

      <Seccion
        titulo="Cobranza en el tiempo"
        descripcion="Facturado y cobrado acumulados. La distancia entre las líneas es lo que sigue sin entrar."
      >
        <Grafica
          tipo="linea"
          series={SERIES_ACUMULADAS}
          puntos={acumulados.puntos}
          etiqueta="Facturado y cobrado acumulados por mes"
          alto={260}
          vacio="No hay meses con fecha que acumular."
        />
        <BrechaAlCierre
          ultimo={acumulados.puntos[acumulados.puntos.length - 1]?.fecha ?? null}
          brecha={brechaFinal(acumulados)}
        />
        <NotaFueraDelEje fuera={acumulados.fueraDelEje} />
      </Seccion>
    </div>
  );
}

// --------------------------- M3.1: indicadores ---------------------------

function Indicadores({ flujo, fuera }: { flujo: Flujo; fuera: FueraDelEje | null }) {
  const i = indicadoresFlujo(flujo);
  const total = totalFlujo(flujo);
  const cobradoSinFecha = fuera?.cobrado ?? 0;

  return (
    <RejillaKPI>
      <TarjetaKPI
        etiqueta="Facturado"
        valor={moneda(i.facturado)}
        nota={`${entero(total.operaciones)} ${total.operaciones === 1 ? "operación" : "operaciones"}, por fecha de venta.`}
      />
      <TarjetaKPI
        etiqueta="Cobrado"
        valor={moneda(i.cobrado)}
        tono="positivo"
        nota={
          cobradoSinFecha > 0 ? (
            <>
              Incluye <Cifra tono="tenue">{moneda(cobradoSinFecha)}</Cifra> sin fecha de pago.
            </>
          ) : (
            "Abonos recibidos, por fecha de pago."
          )
        }
      />
      <TarjetaKPI
        etiqueta="Saldo"
        valor={moneda(i.saldo)}
        tono={i.saldo > 0 ? "riesgo" : "positivo"}
        nota="Facturado que todavía no entra en efectivo."
      />
      <TarjetaKPI
        etiqueta="Conversión a efectivo"
        valor={porcentaje(i.conversion)}
        tono={tonoConversion(i.conversion)}
        nota={
          i.conversion === null
            ? "Sin facturación contra la cual medir."
            : "Cobrado entre facturado del periodo."
        }
      />
    </RejillaKPI>
  );
}

// --------------------------- M3.2 y M3.5: notas de las graficas ---------------------------

function BrechaAlCierre({ ultimo, brecha }: { ultimo: Date | null; brecha: number | null }) {
  if (brecha === null || ultimo === null) return null;
  return (
    <p className="mt-2 text-xs text-slate-600">
      Brecha acumulada al cierre de {fechaCorta(ultimo)}:{" "}
      <Cifra tono={brecha > 0 ? "riesgo" : "positivo"} className="font-semibold">
        {moneda(brecha)}
      </Cifra>
    </p>
  );
}

// --------------------------- M3.3: tabla mensual ---------------------------

const COLUMNAS_MESES: readonly ColumnaTabla<FilaMesFlujo>[] = [
  {
    clave: "mes",
    encabezado: "Mes",
    celda: (f) => (f.clave === "total" ? "Total" : fmtMes(f.clave)),
  },
  {
    clave: "operaciones",
    encabezado: "Operaciones",
    alineacion: "derecha",
    celda: (f) => entero(f.operaciones),
    ancho: "6rem",
  },
  {
    clave: "facturado",
    encabezado: "Facturado",
    alineacion: "derecha",
    celda: (f) => moneda(f.facturado),
  },
  {
    clave: "cobrado",
    encabezado: "Cobrado",
    alineacion: "derecha",
    celda: (f) => moneda(f.cobrado),
  },
  {
    clave: "saldo",
    encabezado: "Saldo generado",
    alineacion: "derecha",
    titulo:
      "Facturado menos cobrado en el mes. Entre paréntesis cuando ese mes entró más de lo que se facturó.",
    celda: (f) => moneda(f.saldoGenerado),
  },
  {
    clave: "pct",
    encabezado: "% cobrado",
    alineacion: "derecha",
    titulo:
      "Cobrado entre facturado del mes. Puede pasar de 100%: lo que entra paga también ventas anteriores.",
    celda: (f) => porcentaje(f.pctCobrado, 0),
    ancho: "6rem",
  },
];

function TablaMensual({ calculos }: { calculos: Calculos }) {
  const { flujo } = calculos;
  return (
    <div className="max-w-4xl">
      <TablaCifras
        etiquetaTabla="Facturado y cobrado por mes"
        columnas={COLUMNAS_MESES}
        filas={filasMensualesFlujo(flujo).map((f) => ({ id: f.clave, datos: f, tono: f.tono }))}
        totales={{ id: "total", datos: totalFlujo(flujo) }}
      />
    </div>
  );
}

// --------------------------- M3.4: estacionalidad ---------------------------

function Estacionalidad({ calculos }: { calculos: Calculos }) {
  const insights = INSIGHTS_DE_ESTACIONALIDAD.flatMap((id) =>
    calculos.insights.filter((i) => i.id === id),
  );

  if (insights.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        Hace falta venta en al menos dos meses para medir estacionalidad.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {insights.map((i) => (
        <Callout key={i.id} titulo={i.titulo} tono={i.nivel}>
          {i.detalle}
        </Callout>
      ))}
    </div>
  );
}

// --------------------------- apoyo ---------------------------

function Nota({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[11px] leading-snug text-slate-500">{children}</p>;
}
