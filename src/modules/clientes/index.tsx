import { type ReactNode, useMemo } from "react";

import { Callout, TodoEnOrden } from "../../components/ui/Callout";
import { TablaCifras } from "../../components/ui/TablaCifras";
import { RejillaKPI, TarjetaKPI } from "../../components/ui/TarjetaKPI";
import { Cifra, Seccion } from "../../components/ui/primitivas";
import type { ColumnaTabla } from "../../components/ui/tabla";
import { UMBRAL_ATTACH, UMBRAL_CONCENTRACION_TOP5 } from "../../lib/calc";
import { entero, fecha as fmtFecha, moneda, nulo, porcentaje } from "../../lib/format";
import { type Calculos, useAppStore } from "../../store/useAppStore";
import { ETIQUETA_BUCKET } from "../cobranza/selectores";
import {
  type FilaCliente,
  type OperacionCliente,
  filasClientes,
  operacionesDe,
  ventaCruzada,
} from "./selectores";

/**
 * Modulo 6 — Clientes.
 *
 * Lee del store y no calcula: concentracion, attach rate y saldos vienen del
 * motor; el tramo y el tono del saldo, de `selectores.ts`.
 *
 * REGLA DE LECTURA: la tabla se ordena por ingreso y ninguna fila lleva tono.
 * El tono va solo en la celda del saldo y depende de su antiguedad. El mejor
 * cliente puede tener una venta reciente a credito; pintarlo de rojo por eso
 * seria un error grave de lectura.
 */
export function ModuloClientes({ calculos }: { calculos: Calculos }) {
  return (
    <div>
      <Indicadores calculos={calculos} />

      <Seccion
        titulo="Concentración de clientes"
        descripcion="Ordenada por ingreso. Despliegue un cliente para ver sus operaciones."
      >
        <TablaClientes calculos={calculos} />
      </Seccion>

      <Seccion
        titulo="Venta cruzada de accesorios"
        descripcion="Cuántos compradores de equipo se llevaron también accesorios."
      >
        <VentaCruzadaSeccion calculos={calculos} />
      </Seccion>

      <Seccion titulo="Riesgo de concentración">
        <RiesgoConcentracion calculos={calculos} />
      </Seccion>
    </div>
  );
}

// --------------------------- B6.1: indicadores ---------------------------

function Indicadores({ calculos }: { calculos: Calculos }) {
  const { clientes, resultados } = calculos;
  const { top5 } = clientes.concentracion;
  const attach = clientes.attachRate;
  // Ausencia de linea no es attach rate bajo: ver `attach-rate-bajo` en insights.
  const hayAccesorios = attach.operacionesAccesorio > 0;

  return (
    <RejillaKPI>
      <TarjetaKPI
        etiqueta="Clientes"
        valor={entero(clientes.totalClientes)}
        nota={`${entero(clientes.recurrentes)} con más de una operación.`}
      />
      <TarjetaKPI
        etiqueta="Ticket promedio"
        valor={moneda(resultados.total.ticketPromedio)}
        nota={`Venta entre ${entero(resultados.total.operaciones)} operaciones.`}
      />
      <TarjetaKPI
        etiqueta="Ingreso de los 5 mayores"
        valor={porcentaje(top5)}
        tono={top5 !== null && top5 > UMBRAL_CONCENTRACION_TOP5 ? "advertencia" : "neutro"}
        nota={`Umbral de concentración: ${porcentaje(UMBRAL_CONCENTRACION_TOP5, 0)}.`}
      />
      <TarjetaKPI
        etiqueta="Attach rate de accesorios"
        valor={hayAccesorios ? porcentaje(attach.tasa, 0) : "n/d"}
        tono={hayAccesorios && attach.tasa !== null && attach.tasa < UMBRAL_ATTACH ? "advertencia" : "neutro"}
        nota={
          !hayAccesorios
            ? "El negocio no vendió accesorios en el periodo: la métrica no aplica."
            : attach.tasa === null
              ? "Nadie compró equipo en el periodo."
              : `${entero(attach.clientesConAmbos)} de ${entero(attach.clientesConEquipo)} compradores de equipo.`
        }
      />
    </RejillaKPI>
  );
}

// --------------------------- B6.2: tabla ---------------------------

/** El saldo se colorea en su celda, nunca en la fila. */
function CeldaSaldo({ fila }: { fila: FilaCliente }) {
  return (
    <Cifra tono={fila.tonoSaldo} className="text-xs">
      {moneda(fila.saldo)}
    </Cifra>
  );
}

const COLUMNAS_CLIENTES: readonly ColumnaTabla<FilaCliente>[] = [
  { clave: "cliente", encabezado: "Cliente", celda: (c) => c.nombre, ordenar: (c) => c.nombre },
  {
    clave: "operaciones",
    encabezado: "Ops.",
    alineacion: "derecha",
    celda: (c) => entero(c.operaciones),
    ordenar: (c) => c.operaciones,
    ancho: "4rem",
  },
  {
    clave: "ingreso",
    encabezado: "Ingreso",
    alineacion: "derecha",
    celda: (c) => moneda(c.ingreso),
    ordenar: (c) => c.ingreso,
  },
  {
    clave: "participacion",
    encabezado: "% del total",
    alineacion: "derecha",
    celda: (c) => porcentaje(c.participacion),
    ordenar: (c) => c.participacion,
    ancho: "6rem",
  },
  {
    clave: "saldo",
    encabezado: "Saldo",
    alineacion: "derecha",
    titulo: "En rojo solo si parte del saldo lleva más de 180 días; en ámbar, entre 91 y 180.",
    celda: (c) => <CeldaSaldo fila={c} />,
    ordenar: (c) => c.saldo,
  },
  {
    clave: "tramo",
    encabezado: "Tramo más antiguo",
    celda: (c) => (c.tramo === null ? "—" : ETIQUETA_BUCKET[c.tramo]),
    ancho: "8rem",
  },
  {
    clave: "recurrente",
    encabezado: "Recurrente",
    celda: (c) => (c.recurrente ? "Sí" : "No"),
    ordenar: (c) => (c.recurrente ? 1 : 0),
    ancho: "6rem",
  },
];

function TablaClientes({ calculos }: { calculos: Calculos }) {
  const dataset = useAppStore((s) => s.dataset);
  const conCobranza = calculos.capacidades.cobranza;
  const filas = useMemo(
    () => filasClientes(calculos.clientes, calculos.cartera, conCobranza),
    [calculos.clientes, calculos.cartera, conCobranza],
  );

  return (
    <>
      <TablaCifras
        etiquetaTabla="Clientes por ingreso"
        columnas={COLUMNAS_CLIENTES}
        // Ninguna fila lleva tono: ver la regla de lectura del modulo.
        filas={filas.map((c) => ({ id: c.clave, datos: c }))}
        ordenInicial={{ clave: "ingreso", direccion: "desc" }}
        expandir={(c) => (
          <Operaciones operaciones={operacionesDe(c.clave, calculos.cartera, dataset, conCobranza)} />
        )}
        vacio="No hay ventas computables."
      />
      {!conCobranza && (
        <Nota>
          Sin hoja cobranza el saldo es la venta completa de cada cliente, así que no se colorea por
          antigüedad.
        </Nota>
      )}
    </>
  );
}

const COLUMNAS_OPERACIONES: readonly ColumnaTabla<OperacionCliente>[] = [
  { clave: "folio", encabezado: "Folio", celda: (o) => <span className="cifras">{o.folio}</span>, ancho: "5rem" },
  { clave: "fecha", encabezado: "Fecha", celda: (o) => <span className="cifras">{fmtFecha(o.fecha)}</span>, ancho: "6rem" },
  { clave: "linea", encabezado: "Línea", celda: (o) => nulo(o.linea), ancho: "7rem" },
  { clave: "modelo", encabezado: "Modelo", celda: (o) => nulo(o.modelo) },
  { clave: "venta", encabezado: "Venta", alineacion: "derecha", celda: (o) => moneda(o.precioVenta) },
  { clave: "cobrado", encabezado: "Cobrado", alineacion: "derecha", celda: (o) => moneda(o.cobrado) },
  {
    clave: "saldo",
    encabezado: "Saldo",
    alineacion: "derecha",
    celda: (o) => (
      <Cifra tono={o.tonoSaldo} className="text-xs">
        {moneda(o.saldo)}
      </Cifra>
    ),
  },
];

function Operaciones({ operaciones }: { operaciones: readonly OperacionCliente[] }) {
  return (
    <TablaCifras
      etiquetaTabla="Operaciones del cliente"
      columnas={COLUMNAS_OPERACIONES}
      filas={operaciones.map((o) => ({ id: o.folio, datos: o }))}
    />
  );
}

// --------------------------- B6.3: venta cruzada ---------------------------

function VentaCruzadaSeccion({ calculos }: { calculos: Calculos }) {
  const vc = ventaCruzada(calculos.clientes, calculos.producto, calculos.resultados.total.ventaTotal);
  const oportunidad = calculos.insights.find((i) => i.id === "attach-rate-bajo");

  return (
    <>
      <RejillaKPI>
        <TarjetaKPI
          etiqueta="Compradores de equipo"
          valor={entero(vc.compradoresEquipo)}
          nota="Clientes con al menos una venta de la línea Equipo."
        />
        <TarjetaKPI
          etiqueta="Compraron accesorio"
          valor={entero(vc.conAccesorio)}
          nota="De esos mismos clientes."
        />
        <TarjetaKPI
          etiqueta="Attach rate"
          valor={vc.hayAccesorios ? porcentaje(vc.attachRate, 0) : "n/d"}
          tono={
            vc.hayAccesorios && vc.attachRate !== null && vc.attachRate < UMBRAL_ATTACH
              ? "advertencia"
              : "neutro"
          }
          nota={
            vc.hayAccesorios
              ? `Referencia: ${porcentaje(UMBRAL_ATTACH, 0)}.`
              : "Sin ventas de accesorios la métrica no aplica."
          }
        />
        <TarjetaKPI
          etiqueta="Ingreso por accesorios"
          valor={moneda(vc.ingresoAccesorios)}
          nota={`${porcentaje(vc.pctIngreso)} del ingreso total.`}
        />
      </RejillaKPI>
      {oportunidad !== undefined && (
        <Callout titulo={oportunidad.titulo} tono={oportunidad.nivel}>
          {oportunidad.detalle}
        </Callout>
      )}
    </>
  );
}

// --------------------------- B6.4: concentracion ---------------------------

function RiesgoConcentracion({ calculos }: { calculos: Calculos }) {
  const alerta = calculos.insights.find((i) => i.id === "concentracion-clientes");

  if (alerta !== undefined) {
    return (
      <Callout titulo={alerta.titulo} tono={alerta.nivel}>
        {alerta.detalle}
      </Callout>
    );
  }

  if (calculos.clientes.concentracion.top5 === null) {
    return <p className="text-xs text-slate-500">Sin ingreso computable no hay concentración que medir.</p>;
  }

  return (
    <TodoEnOrden titulo="Ingreso repartido entre varios clientes">
      Los 5 mayores suman <Cifra>{porcentaje(calculos.clientes.concentracion.top5)}</Cifra> del
      ingreso, por debajo del umbral de {porcentaje(UMBRAL_CONCENTRACION_TOP5, 0)}.
    </TodoEnOrden>
  );
}

// --------------------------- apoyo ---------------------------

function Nota({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[11px] leading-snug text-slate-500">{children}</p>;
}
