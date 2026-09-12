import { Callout, TodoEnOrden } from "../../components/ui/Callout";
import { TablaCifras } from "../../components/ui/TablaCifras";
import { RejillaKPI, TarjetaKPI } from "../../components/ui/TarjetaKPI";
import { Cifra, Seccion } from "../../components/ui/primitivas";
import type { ColumnaTabla } from "../../components/ui/tabla";
import type { Insight } from "../../lib/calc";
import {
  dias as fmtDias,
  entero,
  fecha as fmtFecha,
  moneda,
  nulo,
  porcentaje,
} from "../../lib/format";
import type { Cobranza as Abono, Dataset } from "../../lib/schema";
import { type Calculos, useAppStore } from "../../store/useAppStore";
import { BarraAntiguedad } from "./BarraAntiguedad";
import { TablaEscenarios } from "./TablaEscenarios";
import {
  ETIQUETA_BUCKET,
  type ExposicionCliente,
  type FilaSaldo,
  abonosDe,
  exposicionPorCliente,
  saldosPendientes,
  sinFechasDePago,
  tonoDeBucket,
} from "./selectores";

/** Hallazgos del motor que pertenecen a este modulo. */
const INSIGHTS_DE_CARTERA = ["utilidad-en-cartera", "cartera-mas-180", "cartera-sin-fecha"];

/**
 * Modulo 4 — Cobranza.
 *
 * Lee del store y no calcula nada: los importes vienen del motor, y el orden y
 * los tonos de `selectores.ts`. Si aqui apareciera una suma de dinero, estaria
 * mal ubicada.
 */
export function ModuloCobranza({ calculos }: { calculos: Calculos }) {
  const dataset = useAppStore((s) => s.dataset);
  const { cartera } = calculos;

  const insights = calculos.insights.filter((i) => INSIGHTS_DE_CARTERA.includes(i.id));

  return (
    <div>
      {insights.length > 0 && (
        <div className="mb-4 space-y-2">
          {insights.map((i) => (
            <CalloutInsight key={i.id} insight={i} />
          ))}
        </div>
      )}

      <Indicadores calculos={calculos} />

      <Seccion
        titulo="Distribución por antigüedad"
        descripcion={`Saldo por cobrar al ${fmtFecha(cartera.fechaCorte)}.`}
      >
        <BarraAntiguedad cartera={cartera} />
      </Seccion>

      <Seccion
        titulo="Saldos pendientes"
        descripcion="Ordenados por antigüedad. Despliegue una fila para ver sus abonos."
      >
        <TablaSaldos calculos={calculos} dataset={dataset} />
      </Seccion>

      <Seccion
        titulo="Provisión de cartera"
        descripcion="Ajuste las tasas para ver el efecto sobre la utilidad. Aplican a todo el reporte."
      >
        <PanelProvision calculos={calculos} />
      </Seccion>

      <Seccion
        titulo="Concentración por cliente"
        descripcion="Ordenada por saldo: responde a quién conviene cobrar primero."
      >
        <TablaConcentracion cartera={cartera} />
      </Seccion>
    </div>
  );
}

/** El texto lo redacta `insights.ts`; aqui solo se elige como se ve. */
function CalloutInsight({ insight }: { insight: Insight }) {
  return (
    <Callout titulo={insight.titulo} tono={insight.nivel}>
      {insight.detalle}
    </Callout>
  );
}

// --------------------------- B1: indicadores ---------------------------

/** Sobre este umbral, la proporcion de cartera se pinta como riesgo. */
const UMBRAL_RIESGO = 0.3;

function Indicadores({ calculos }: { calculos: Calculos }) {
  const { cartera } = calculos;
  const sobreVenta = cartera.ventaTotal === 0 ? null : cartera.saldoTotal / cartera.ventaTotal;
  const partMas180 = cartera.aging.participacion["+180"];

  return (
    <RejillaKPI>
      <TarjetaKPI
        etiqueta="Saldo por cobrar"
        valor={moneda(cartera.saldoTotal)}
        tono={cartera.saldoTotal > 0 ? "riesgo" : "positivo"}
        nota={`De una venta de ${moneda(cartera.ventaTotal)}.`}
      />
      <TarjetaKPI
        etiqueta="Saldo sobre venta"
        valor={porcentaje(sobreVenta)}
        tono={sobreVenta !== null && sobreVenta > UMBRAL_RIESGO ? "riesgo" : "neutro"}
        nota="Proporción de lo facturado que sigue sin entrar."
      />
      <TarjetaKPI
        etiqueta="Cartera +180 días"
        valor={moneda(cartera.aging.porBucket["+180"])}
        tono={partMas180 !== null && partMas180 > UMBRAL_RIESGO ? "riesgo" : "advertencia"}
        nota={
          partMas180 === null
            ? "Sin cartera que clasificar."
            : `${porcentaje(partMas180)} de la cartera.`
        }
      />
      <TarjetaKPI
        etiqueta="DSO"
        valor={cartera.dso === null ? null : fmtDias(Math.round(cartera.dso))}
        nota={
          cartera.dso === null
            ? "Requiere el periodo en la hoja parámetros, o al menos una venta con fecha."
            : "Días que tarda en promedio en cobrarse una venta."
        }
      />
    </RejillaKPI>
  );
}

// --------------------------- B3: saldos pendientes ---------------------------

/**
 * Definidas a nivel de modulo a proposito: si se construyeran dentro del
 * componente cambiarian de identidad en cada render y anularian la memoizacion
 * del ordenamiento en `TablaCifras`.
 */
const COLUMNAS_SALDOS: readonly ColumnaTabla<FilaSaldo>[] = [
  {
    clave: "folio",
    encabezado: "Folio",
    celda: (s) => <span className="cifras">{s.folio}</span>,
    ordenar: (s) => s.folio,
    ancho: "5rem",
  },
  {
    clave: "cliente",
    encabezado: "Cliente",
    celda: (s) => nulo(s.cliente),
    ordenar: (s) => s.cliente,
  },
  {
    clave: "modelo",
    encabezado: "Modelo",
    celda: (s) => nulo(s.modelo),
    ordenar: (s) => s.modelo,
    ancho: "6rem",
  },
  {
    clave: "fecha",
    encabezado: "Fecha",
    celda: (s) => <span className="cifras">{fmtFecha(s.fecha)}</span>,
    ordenar: (s) => s.fecha?.getTime() ?? null,
    ancho: "6rem",
  },
  {
    clave: "venta",
    encabezado: "Venta",
    alineacion: "derecha",
    celda: (s) => moneda(s.precioVenta),
    ordenar: (s) => s.precioVenta,
  },
  {
    clave: "cobrado",
    encabezado: "Cobrado",
    alineacion: "derecha",
    celda: (s) => moneda(s.cobrado),
    ordenar: (s) => s.cobrado,
  },
  {
    clave: "saldo",
    encabezado: "Saldo",
    alineacion: "derecha",
    celda: (s) => <CeldaSaldo saldo={s.saldo} />,
    ordenar: (s) => s.saldo,
  },
  {
    clave: "dias",
    encabezado: "Días",
    alineacion: "derecha",
    titulo: "Días vencidos si hay crédito pactado; si no, días desde la venta.",
    celda: (s) => (s.dias === null ? "—" : entero(s.dias)),
    ordenar: (s) => s.dias,
    ancho: "4rem",
  },
  {
    clave: "bucket",
    encabezado: "Antigüedad",
    celda: (s) => ETIQUETA_BUCKET[s.bucket],
    ordenar: (s) => s.dias,
    ancho: "8rem",
  },
];

/** Un saldo negativo se muestra y se explica; no se esconde ni se pone en cero. */
function CeldaSaldo({ saldo }: { saldo: number }) {
  if (saldo >= 0) return <>{moneda(saldo)}</>;
  return (
    <span className="font-semibold text-advertencia">
      {moneda(saldo)}
      <span className="ml-1 text-[10px] font-normal" title="Se cobró más que el precio de venta">
        sobrecobro
      </span>
    </span>
  );
}

function TablaSaldos({ calculos, dataset }: { calculos: Calculos; dataset: Dataset | null }) {
  const pendientes = saldosPendientes(calculos.cartera, dataset);

  if (pendientes.length === 0) {
    return (
      <TodoEnOrden titulo="No hay saldos pendientes">
        Todas las ventas del periodo están cobradas por completo.
      </TodoEnOrden>
    );
  }

  return (
    <TablaCifras
      etiquetaTabla="Saldos pendientes por venta"
      columnas={COLUMNAS_SALDOS}
      filas={pendientes.map((s) => ({
        id: s.folio,
        datos: s,
        tono: s.saldo < 0 ? "advertencia" : tonoDeBucket(s.bucket),
      }))}
      ordenInicial={{ clave: "dias", direccion: "desc" }}
      expandir={(s) =>
        dataset === null ? null : <DetalleAbonos dataset={dataset} folio={s.folio} />
      }
    />
  );
}

const COLUMNAS_ABONOS: readonly ColumnaTabla<Abono>[] = [
  {
    clave: "folio_pago",
    encabezado: "Pago",
    celda: (a) => <span className="cifras">{nulo(a.folio_pago)}</span>,
  },
  {
    clave: "fecha",
    encabezado: "Fecha de pago",
    celda: (a) => <span className="cifras">{fmtFecha(a.fecha_pago)}</span>,
  },
  { clave: "metodo", encabezado: "Método", celda: (a) => nulo(a.metodo) },
  { clave: "monto", encabezado: "Monto", alineacion: "derecha", celda: (a) => moneda(a.monto) },
];

/** Abonos capturados contra una venta. Si no traen fecha, se dice explicitamente. */
function DetalleAbonos({ dataset, folio }: { dataset: Dataset; folio: string }) {
  const abonos = abonosDe(dataset, folio);

  if (abonos.length === 0) {
    return (
      <p className="text-[11px] text-slate-500">
        No hay abonos capturados contra <span className="cifras">{folio}</span>. El saldo es el
        precio de venta completo.
      </p>
    );
  }

  return (
    <div>
      {sinFechasDePago(abonos) && (
        <p className="mb-1.5 text-[11px] text-advertencia">
          Ninguno de estos abonos tiene fecha de pago capturada: se conocen los montos, pero no
          cuándo entraron. Por eso el módulo de flujo no puede construirse.
        </p>
      )}
      <TablaCifras
        etiquetaTabla={`Abonos de ${folio}`}
        columnas={COLUMNAS_ABONOS}
        filas={abonos.map((a, i) => ({ id: `${folio}-${a.folio_pago ?? i}`, datos: a }))}
      />
    </div>
  );
}

// --------------------------- B4: provision ---------------------------

function PanelProvision({ calculos }: { calculos: Calculos }) {
  const parametros = useAppStore((s) => s.parametros);
  const actualizarParametro = useAppStore((s) => s.actualizarParametro);

  const porBucket = calculos.cartera.aging.porBucket;
  const utilidad = calculos.resultados.total.utilidadContribucion;

  // La provision vigente la calculo el motor; aqui solo se lee.
  const provision = calculos.cartera.provision;
  const ajustada = utilidad - provision;
  const variacion = utilidad === 0 ? null : -provision / utilidad;

  return (
    // Controles y tabla comparten renglon si caben; si no, se apilan. Antes era
    // `lg:`, que mira el ancho de la VENTANA: con la seccion metida en media
    // pantalla, una ventana grande seguia pidiendo dos columnas de 20rem y la
    // tabla de escenarios quedaba estrangulada.
    <div className="flex flex-wrap gap-4">
      <div className="min-w-0 grow basis-80">
        <Control
          etiqueta="Tasa 91 a 180 días"
          valor={parametros.provision91180}
          onChange={(v) => actualizarParametro("provision91180", v)}
          monto={porBucket["91-180"]}
        />
        <Control
          etiqueta="Tasa más de 180 días"
          valor={parametros.provisionMas180}
          onChange={(v) => actualizarParametro("provisionMas180", v)}
          monto={porBucket["+180"]}
        />

        <div className="mt-3 border-t border-slate-200 pt-2">
          <FilaResumen etiqueta="Monto provisionado" valor={moneda(provision)} tono="riesgo" />
          <FilaResumen etiqueta="Utilidad de contribución" valor={moneda(utilidad)} />
          <FilaResumen
            etiqueta="Utilidad ajustada"
            valor={moneda(ajustada)}
            tono={ajustada >= 0 ? "positivo" : "riesgo"}
          />
          <FilaResumen
            etiqueta="Variación"
            valor={porcentaje(variacion)}
            tono={variacion !== null && variacion < -UMBRAL_RIESGO ? "riesgo" : "advertencia"}
          />
        </div>
      </div>

      <div className="min-w-0 grow basis-[28rem]">
        <TablaEscenarios porBucket={porBucket} utilidadContribucion={utilidad} />
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          Los cuatro escenarios son referencias fijas: muestran el rango de la exposición y no
          cambian con los controles. La fila resaltada, «Tasas aplicadas», es la que usa todo el
          reporte y sí se mueve con ellos.
        </p>
      </div>
    </div>
  );
}

function Control({
  etiqueta,
  valor,
  onChange,
  monto,
}: {
  etiqueta: string;
  valor: number;
  onChange: (v: number) => void;
  monto: number;
}) {
  const id = `provision-${etiqueta.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs text-slate-600">
          {etiqueta}
        </label>
        <Cifra className="text-sm font-semibold">{porcentaje(valor, 0)}</Cifra>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(valor * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="mt-1 w-full accent-marino print:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marino"
      />
      <p className="text-[11px] text-slate-500">
        Sobre <Cifra tono="tenue">{moneda(monto)}</Cifra> de saldo en este tramo.
      </p>
    </div>
  );
}

function FilaResumen({
  etiqueta,
  valor,
  tono = "neutro",
}: {
  etiqueta: string;
  valor: string;
  tono?: "neutro" | "positivo" | "riesgo" | "advertencia";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1 last:border-0">
      <span className="text-xs text-slate-600">{etiqueta}</span>
      <Cifra tono={tono} className="text-sm font-semibold">
        {valor}
      </Cifra>
    </div>
  );
}

// --------------------------- C: concentracion ---------------------------

const COLUMNAS_CONCENTRACION: readonly ColumnaTabla<ExposicionCliente>[] = [
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
    clave: "venta",
    encabezado: "Venta",
    alineacion: "derecha",
    celda: (c) => moneda(c.venta),
    ordenar: (c) => c.venta,
  },
  {
    clave: "saldo",
    encabezado: "Saldo",
    alineacion: "derecha",
    celda: (c) => moneda(c.saldo),
    ordenar: (c) => c.saldo,
  },
  {
    clave: "participacion",
    encabezado: "% del saldo",
    alineacion: "derecha",
    celda: (c) => porcentaje(c.participacion),
    ordenar: (c) => c.participacion,
    ancho: "6rem",
  },
  {
    clave: "bucket",
    encabezado: "Tramo más antiguo",
    celda: (c) => (c.bucketMasAntiguo === null ? "—" : ETIQUETA_BUCKET[c.bucketMasAntiguo]),
    ancho: "9rem",
  },
];

function TablaConcentracion({ cartera }: { cartera: Calculos["cartera"] }) {
  const exposicion = exposicionPorCliente(cartera).filter((c) => c.saldo !== 0);

  if (exposicion.length === 0) {
    return (
      <TodoEnOrden titulo="Ningún cliente tiene saldo pendiente">
        No hay exposición crediticia con la cartera actual.
      </TodoEnOrden>
    );
  }

  return (
    <TablaCifras
      etiquetaTabla="Exposición crediticia por cliente"
      columnas={COLUMNAS_CONCENTRACION}
      filas={exposicion.map((c) => ({
        id: c.clave,
        datos: c,
        tono: c.bucketMasAntiguo === "+180" ? ("riesgo" as const) : ("neutro" as const),
      }))}
      ordenInicial={{ clave: "saldo", direccion: "desc" }}
    />
  );
}
