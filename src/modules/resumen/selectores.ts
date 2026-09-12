import type { PuntoCategoria, PuntoTemporal } from "../../components/ui/datosGrafica";
import type { Tono } from "../../components/ui/primitivas";
import {
  type Cartera,
  type Insight,
  type NivelInsight,
  type VentaExcluida,
  divSegura,
  particionarVentas,
} from "../../lib/calc";
import { entero, fecha, moneda, porcentaje } from "../../lib/format";
import type { Dataset } from "../../lib/schema";
import type { Calculos } from "../../store/useAppStore";
import { type ExposicionCliente, exposicionPorCliente } from "../cobranza/selectores";
import { puntosProducto } from "../producto/selectores";
import { type FueraDelEje, puntosMensuales } from "../ventas-flujo/selectores";

/**
 * Logica de PRESENTACION del Resumen ejecutivo.
 *
 * El resumen es ensamblaje: no calcula nada que los otros cinco modulos no
 * hayan calculado ya. Aqui solo se eligen piezas, se ordenan y se decide que
 * mostrar cuando falta una hoja. Todo sale del motor o de los selectores de
 * los demas modulos.
 */

// --------------------------- B1: indicadores ---------------------------

export interface KpiResumen {
  readonly clave: string;
  readonly etiqueta: string;
  /** Ya formateado. null = no se puede calcular; `nota` dice por que. */
  readonly valor: string | null;
  readonly tono: Tono;
  readonly nota: string;
}

/** Sobre esta proporcion, la cartera de +180 dias se marca en riesgo. */
const UMBRAL_MAS_180 = 0.3;

const SIN_COBRANZA = "Requiere la hoja cobranza.";

/**
 * Los ocho indicadores de la pagina 1 del reporte de referencia, en su orden.
 *
 * Los cuatro que dependen de abonos (saldo, cobrado, +180) no se inventan sin
 * hoja de cobranza: sin abonos, el motor veria toda la venta como saldo, y un
 * "saldo por cobrar = venta total" en portada seria una afirmacion falsa.
 */
export function kpisResumen(calculos: Calculos): readonly KpiResumen[] {
  const { total } = calculos.resultados;
  const { cartera } = calculos;
  const conCobranza = calculos.capacidades.cobranza;
  const mas180 = cartera.aging.porBucket["+180"];
  const part180 = cartera.aging.participacion["+180"];

  const deCartera = (
    clave: string,
    etiqueta: string,
    valor: string,
    tono: Tono,
    nota: string,
  ): KpiResumen =>
    conCobranza
      ? { clave, etiqueta, valor, tono, nota }
      : { clave, etiqueta, valor: null, tono: "neutro", nota: SIN_COBRANZA };

  return [
    {
      clave: "venta",
      etiqueta: "Venta total",
      valor: moneda(total.ventaTotal),
      tono: "neutro",
      nota: `${entero(total.operaciones)} operaciones computables.`,
    },
    {
      clave: "utilidad",
      etiqueta: "Utilidad bruta",
      valor: moneda(total.utilidadBruta),
      tono: total.utilidadBruta < 0 ? "riesgo" : "positivo",
      nota: `Sobre un costo de ${moneda(total.costoTotal)}.`,
    },
    {
      clave: "margen",
      etiqueta: "Margen bruto",
      valor: porcentaje(total.margenPct),
      tono: total.margenPct === null ? "neutro" : total.margenPct < 0 ? "riesgo" : "positivo",
      nota: total.margenPct === null ? "Sin venta contra la cual medir." : "Utilidad bruta entre venta.",
    },
    deCartera(
      "saldo",
      "Saldo por cobrar",
      moneda(cartera.saldoTotal),
      cartera.saldoTotal > 0 ? "riesgo" : "positivo",
      `${porcentaje(divSegura(cartera.saldoTotal, cartera.ventaTotal))} de la venta.`,
    ),
    {
      clave: "operaciones",
      etiqueta: "Operaciones",
      valor: entero(total.operaciones),
      tono: "neutro",
      nota:
        calculos.resultados.excluidas.length === 0
          ? "Ninguna fila excluida."
          : `Sin contar ${entero(calculos.resultados.excluidas.length)} fila(s) excluida(s).`,
    },
    {
      clave: "ticket",
      etiqueta: "Ticket promedio",
      valor: total.ticketPromedio === null ? null : moneda(total.ticketPromedio),
      tono: "neutro",
      nota: total.ticketPromedio === null ? "Sin operaciones." : "Venta entre operaciones.",
    },
    deCartera(
      "cobrado",
      "Efectivo cobrado",
      moneda(cartera.cobradoTotal),
      "positivo",
      `${porcentaje(divSegura(cartera.cobradoTotal, cartera.ventaTotal))} de la venta.`,
    ),
    deCartera(
      "mas180",
      "Cartera +180 días",
      moneda(mas180),
      part180 !== null && part180 > UMBRAL_MAS_180 ? "riesgo" : mas180 > 0 ? "advertencia" : "neutro",
      part180 === null ? "Sin cartera que clasificar." : `${porcentaje(part180, 0)} de la cartera.`,
    ),
  ];
}

// --------------------------- B2: hallazgos ---------------------------

/** Orden de lectura: primero lo que pone en riesgo el negocio. */
const PESO_NIVEL: Readonly<Record<NivelInsight, number>> = {
  alerta: 0,
  advertencia: 1,
  oportunidad: 2,
  nota: 3,
};

/**
 * Hallazgos por severidad: alertas, advertencias, oportunidades, notas.
 * Dentro de un mismo nivel se respeta el orden de REGLAS_INSIGHT (el sort es
 * estable), que ya pone primero lo mas importante.
 */
export function porSeveridad(insights: readonly Insight[]): readonly Insight[] {
  return [...insights].sort((a, b) => PESO_NIVEL[a.nivel] - PESO_NIVEL[b.nivel]);
}

// --------------------------- B4: cuentas mayores ---------------------------

/** Las `n` cuentas con mas saldo pendiente, de mayor a menor. */
export function cuentasMayores(cartera: Cartera, n = 3): readonly ExposicionCliente[] {
  return exposicionPorCliente(cartera)
    .filter((c) => c.saldo > 0)
    .slice(0, n);
}

// --------------------------- B5: grafica ---------------------------

export type GraficaResumen =
  | {
      readonly tipo: "flujo";
      readonly puntos: readonly PuntoTemporal[];
      readonly fueraDelEje: FueraDelEje | null;
    }
  | {
      readonly tipo: "producto";
      /**
       * TODOS los modelos, de mayor a menor ingreso. Cuantos caben lo decide la
       * grafica midiendo su propio ancho, no este selector.
       */
      readonly puntos: readonly PuntoCategoria[];
      /** Por que no se muestra el flujo. Siempre se dice. */
      readonly motivo: string;
    };

/**
 * Facturado contra cobrado si hay fechas de pago; si no, ingreso por modelo.
 * Nunca un hueco: la portada del reporte siempre lleva una grafica, y cuando
 * no es la de flujo, dice por que.
 */
export function graficaResumen(calculos: Calculos): GraficaResumen {
  if (calculos.capacidades.flujo) {
    const { puntos, fueraDelEje } = puntosMensuales(calculos.flujo);
    return { tipo: "flujo", puntos, fueraDelEje };
  }
  return {
    tipo: "producto",
    puntos: puntosProducto(calculos.producto),
    motivo: calculos.capacidades.cobranza
      ? "Los abonos no traen fecha de pago, así que no hay flujo de efectivo que graficar. Se muestra el ingreso por modelo."
      : "Sin hoja cobranza no hay flujo de efectivo que graficar. Se muestra el ingreso por modelo.",
  };
}

// --------------------------- B6: periodo y alcance ---------------------------

export interface Periodo {
  readonly inicio: Date;
  readonly fin: Date;
  /** De donde salio: capturado en parametros, o deducido de las ventas. */
  readonly origen: "parametros" | "ventas";
}

/**
 * El periodo del reporte: el de la hoja parametros si viene completo; si no,
 * el rango de fechas de las ventas computables. null si no hay de donde
 * sacarlo, y la UI lo dice.
 */
export function periodoDelReporte(dataset: Dataset): Periodo | null {
  const { periodo_inicio, periodo_fin } = dataset.parametros;
  if (periodo_inicio !== null && periodo_fin !== null) {
    return { inicio: periodo_inicio, fin: periodo_fin, origen: "parametros" };
  }
  const fechas = particionarVentas(dataset.ventas)
    .incluidas.map((v) => v.fecha)
    .filter((f): f is Date => f !== null)
    .map((f) => f.getTime());
  if (fechas.length === 0) return null;
  return {
    inicio: new Date(Math.min(...fechas)),
    fin: new Date(Math.max(...fechas)),
    origen: "ventas",
  };
}

/** "01/01/2026 al 31/12/2026, según la hoja parámetros". */
export function textoPeriodo(periodo: Periodo | null): string {
  if (periodo === null) return "Sin periodo: ni la hoja parámetros ni las ventas traen fechas.";
  const rango = `${fecha(periodo.inicio)} al ${fecha(periodo.fin)}`;
  return periodo.origen === "parametros"
    ? `${rango}, según la hoja parámetros`
    : `${rango}, rango de las ventas capturadas (la hoja parámetros no trae periodo)`;
}

export interface Alcance {
  readonly incluye: readonly string[];
  readonly noIncluye: readonly string[];
}

const MOTIVO_CORTO: Readonly<Record<VentaExcluida["motivo"], string>> = {
  demo: "Demo",
  "sin-precio": "sin precio",
};

/**
 * Que cubre el reporte y que no, en frases cortas.
 *
 * Lo que "no incluye" mezcla dos cosas a proposito: los limites de la v1 (no
 * hay inventario ni balance, sin importar el archivo) y los huecos de ESTE
 * archivo (no trae fechas de pago, no trae dias de credito). El lector necesita
 * ambos para saber cuanto pesar las cifras.
 */
export function alcanceDelReporte(dataset: Dataset, calculos: Calculos): Alcance {
  const { resultados, capacidades } = calculos;
  const incluye: string[] = [];
  const noIncluye: string[] = [];

  incluye.push(`${entero(resultados.total.operaciones)} operaciones de venta computables.`);
  if (resultados.excluidas.length > 0) {
    const lista = resultados.excluidas
      .map((e) => `${e.venta.folio} (${MOTIVO_CORTO[e.motivo]})`)
      .join(", ");
    incluye.push(`Excluidas del análisis de venta, y listadas aparte: ${lista}.`);
  }

  if (capacidades.cobranza) {
    incluye.push(`${entero(dataset.cobranza.length)} abonos de cobranza, contra los que se calcula saldo y antigüedad.`);
    if (!capacidades.flujo) {
      noIncluye.push("Flujo de efectivo real: los abonos no traen fecha de pago.");
    }
  } else {
    noIncluye.push("Cobranza: sin hoja cobranza no hay saldo, antigüedad ni flujo.");
  }

  if (capacidades.estadoResultados) {
    // Solo cuentan los que traen monto: una fila de notas al pie de la hoja no
    // es un gasto, aunque el lector la conserve.
    const conMonto = dataset.gastos.filter((g) => g.monto !== null).length;
    const sinMonto = dataset.gastos.length - conMonto;
    incluye.push(
      `${entero(conMonto)} registros de gastos operativos, tal como se capturaron` +
        (sinMonto > 0 ? ` (${entero(sinMonto)} sin monto, no se suman).` : "."),
    );
  } else {
    noIncluye.push("Gastos operativos: sin hoja gastos, el resultado no los resta.");
  }

  if (!dataset.ventas.some((v) => v.dias_credito !== null)) {
    noIncluye.push("Días de crédito pactados: la antigüedad se mide desde la fecha de venta.");
  }

  noIncluye.push("Utilidad neta auditada: no hay impuestos, depreciación ni gastos sin capturar.");
  noIncluye.push("Inventario, activos fijos, deuda ni aportaciones de socios.");

  return { incluye, noIncluye };
}
