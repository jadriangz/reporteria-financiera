import type { Dataset } from "../schema";

import { mes } from "../format";

import { type Centavos, SIN_FECHA, aCentavos, divSegura } from "./base";
import { BUCKET_SIN_FECHA, type Cartera, calcularCartera } from "./cobranza";
import { type Clientes, calcularClientes } from "./clientes";
import { type Flujo, calcularFlujo } from "./flujo";
import { type Producto, calcularProducto } from "./producto";
import { type Resultados, calcularResultados } from "./resultados";

/**
 * Hallazgos automaticos.
 *
 * Esta capa es lo que separa la app de una tabla dinamica. Es una lista de
 * reglas declarativas: cada una tiene id, nivel, una condicion que mira el
 * contexto y un generador de texto. Anadir un hallazgo es anadir un elemento a
 * REGLAS_INSIGHT, jamas un `if` en un componente.
 *
 * Regla de redaccion: el texto SIEMPRE lleva las cifras concretas y los nombres
 * involucrados. "Hay cartera vencida" no le sirve a nadie; "1,022,000 vencidos a
 * mas de 180 dias, 57% de la cartera, concentrados en Rene Barraza" si.
 */

export type NivelInsight = "alerta" | "advertencia" | "oportunidad" | "nota";

export interface Insight {
  readonly id: string;
  readonly nivel: NivelInsight;
  readonly titulo: string;
  /** Texto con las cifras ya incorporadas. Listo para pintar. */
  readonly detalle: string;
  /** Folios o nombres implicados, para que la UI pueda enlazar al detalle. */
  readonly involucrados: readonly string[];
}

export interface ContextoInsight {
  readonly dataset: Dataset;
  readonly resultados: Resultados;
  readonly cartera: Cartera;
  readonly clientes: Clientes;
  readonly producto: Producto;
  readonly flujo: Flujo;
}

export interface ReglaInsight {
  readonly id: string;
  readonly nivel: NivelInsight;
  /** Que vigila, en una linea. */
  readonly descripcion: string;
  /** Devuelve el hallazgo, o null si la condicion no se cumple. */
  evaluar(ctx: ContextoInsight): Insight | null;
}

// --------------------------- Formato ---------------------------

/** Centavos a pesos con separador de miles. El motor no formatea salvo aqui. */
function pesos(centavos: Centavos): string {
  const signo = centavos < 0 ? "-" : "";
  const enteros = Math.round(Math.abs(centavos) / 100);
  return `${signo}$${enteros.toLocaleString("es-MX")}`;
}

function pct(valor: number | null, decimales = 0): string {
  return valor === null ? "n/d" : `${(valor * 100).toFixed(decimales)}%`;
}

function lista(nombres: readonly string[], max = 3): string {
  if (nombres.length === 0) return "";
  if (nombres.length <= max) return nombres.join(", ");
  return `${nombres.slice(0, max).join(", ")} y ${nombres.length - max} mas`;
}

function crear(
  regla: Pick<ReglaInsight, "id" | "nivel">,
  titulo: string,
  detalle: string,
  involucrados: readonly string[] = [],
): Insight {
  return { id: regla.id, nivel: regla.nivel, titulo, detalle, involucrados };
}

// --------------------------- Reglas ---------------------------

/**
 * ¿Hay abonos capturados?
 *
 * AUSENCIA DE DATO NO ES DATO EN CERO. Sin cobranza el motor no sabe cuanto se
 * cobro; no es lo mismo que saber que no se cobro nada. `calcularCartera` trata
 * a una venta sin abonos como saldo completo, que es correcto venta por venta
 * cuando SI hay cobranza capturada, pero sin ninguna fila de cobranza ese
 * "saldo" es una suposicion. Toda regla que concluya algo del saldo, de la
 * antiguedad o de lo cobrado exige esto primero; si falta, se emite
 * `cartera-no-disponible` en su lugar.
 */
function hayCobranza(ctx: ContextoInsight): boolean {
  return ctx.dataset.cobranza.length > 0;
}

/** La utilidad del periodo esta atrapada en la cartera. */
const utilidadEnCartera: ReglaInsight = {
  id: "utilidad-en-cartera",
  nivel: "alerta",
  descripcion: "El saldo por cobrar supera la utilidad bruta del periodo.",
  evaluar(ctx) {
    if (!hayCobranza(ctx)) return null;
    const saldo = ctx.cartera.saldoTotal;
    const utilidad = ctx.resultados.total.utilidadBruta;
    if (saldo <= utilidad || utilidad <= 0) return null;

    const veces = utilidad === 0 ? null : saldo / utilidad;
    const deudores = ctx.clientes.detalle
      .filter((c) => c.saldo > 0)
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 3);

    return crear(
      this,
      "La utilidad del periodo esta en cartera",
      `El saldo por cobrar es ${pesos(saldo)}, ${veces === null ? "mas" : `${veces.toFixed(1)} veces`} ` +
        `la utilidad bruta del periodo (${pesos(utilidad)}). Mientras no se cobre, la utilidad ` +
        `es contable, no liquida. Mayor exposicion: ${lista(deudores.map((c) => `${c.nombre} (${pesos(c.saldo)})`))}.`,
      deudores.map((c) => c.nombre),
    );
  },
};

/** Umbral de CLAUDE.md: el bucket +180 no debe pasar del 30% de la cartera. */
const UMBRAL_MAS_180 = 0.3;

const carteraVencida: ReglaInsight = {
  id: "cartera-mas-180",
  nivel: "alerta",
  descripcion: "Mas del 30% de la cartera lleva mas de 180 dias.",
  evaluar(ctx) {
    if (!hayCobranza(ctx)) return null;
    const participacion = ctx.cartera.aging.participacion["+180"];
    if (participacion === null || participacion <= UMBRAL_MAS_180) return null;

    const monto = ctx.cartera.aging.porBucket["+180"];
    const afectados = ctx.cartera.detalle
      .filter((s) => s.bucket === "+180" && s.saldo > 0)
      .sort((a, b) => b.saldo - a.saldo);

    const nombres = [...new Set(afectados.map((s) => s.cliente.trim()))];
    const detalleClientes = afectados
      .slice(0, 3)
      .map((s) => `${s.cliente.trim()} ${pesos(s.saldo)} (${s.dias ?? 0} dias, folio ${s.folio})`);

    return crear(
      this,
      "Cartera con mas de 180 dias",
      `${pesos(monto)} llevan mas de 180 dias sin cobrarse: el ${pct(participacion)} de la cartera, ` +
        `muy por encima del 30% tolerable. Involucrados: ${lista(detalleClientes)}.`,
      nombres,
    );
  },
};

/** Umbral de CLAUDE.md: margen identico en mas del 80% de las filas. */
const UMBRAL_MARGEN_UNIFORME = 0.8;
const DECIMALES_MARGEN = 6;

const margenDerivado: ReglaInsight = {
  id: "margen-derivado",
  nivel: "advertencia",
  descripcion: "El mismo margen exacto en casi todas las ventas sugiere costo estimado.",
  evaluar(ctx) {
    const margenes: string[] = [];
    for (const venta of ctx.dataset.ventas) {
      if (venta.precio_venta === null || venta.precio_venta === 0) continue;
      if (venta.costo_unitario === null) continue;
      if (venta.linea === "Demo") continue;
      const m = (venta.precio_venta - venta.costo_unitario) / venta.precio_venta;
      margenes.push(m.toFixed(DECIMALES_MARGEN));
    }
    if (margenes.length === 0) return null;

    const conteo = new Map<string, number>();
    for (const m of margenes) conteo.set(m, (conteo.get(m) ?? 0) + 1);

    let dominante = "";
    let veces = 0;
    for (const [m, n] of conteo) if (n > veces) [dominante, veces] = [m, n];

    const proporcion = veces / margenes.length;
    if (proporcion <= UMBRAL_MARGEN_UNIFORME) return null;

    return crear(
      this,
      "El costo parece derivado del precio",
      `El margen es exactamente ${pct(Number(dominante), 1)} en ${veces} de ${margenes.length} ventas ` +
        `(${pct(proporcion)}). Un costo real casi nunca produce el mismo margen exacto: es probable que ` +
        `se haya capturado aplicando un porcentaje al precio. La utilidad reportada solo sera confiable ` +
        `cuando se capture el costo real de cada equipo.`,
    );
  },
};

/** Umbral de CLAUDE.md: attach rate por debajo del 40% es oportunidad. */
export const UMBRAL_ATTACH = 0.4;

/**
 * Attach rate bajo: pocos compradores de equipo se llevan accesorios.
 *
 * AUSENCIA DE LINEA NO ES ATTACH BAJO. Si el negocio no vendio un solo
 * accesorio en el periodo, la tasa vale 0 y la regla proponia venta cruzada de
 * un catalogo que no existe. Es el mismo error que ya se corrigio en cartera
 * (`hayCobranza`): un cero por falta de dato no es un cero medido. Con al menos
 * una operacion de accesorios el cero si significa que nadie los compro junto
 * con su equipo, y ahi la oportunidad es real.
 */
const attachBajo: ReglaInsight = {
  id: "attach-rate-bajo",
  nivel: "oportunidad",
  descripcion: "Pocos compradores de equipo se llevan accesorios, habiendolos.",
  evaluar(ctx) {
    const { tasa, clientesConAmbos, clientesConEquipo, sinAccesorio, operacionesAccesorio } =
      ctx.clientes.attachRate;
    if (operacionesAccesorio === 0) return null;
    if (tasa === null || tasa >= UMBRAL_ATTACH) return null;

    return crear(
      this,
      "Oportunidad de venta cruzada",
      `Solo ${clientesConAmbos} de ${clientesConEquipo} clientes que compraron equipo se llevaron ` +
        `accesorios (${pct(tasa)}), debajo del 40% esperado. Sin accesorios: ${lista(sinAccesorio, 5)}.`,
      sinAccesorio,
    );
  },
};

/**
 * Umbral de concentracion: los cinco clientes mas grandes no deberian pasar de
 * la mitad del ingreso. Se exporta para que la UI pueda decir contra que se
 * midio cuando la regla NO se dispara.
 */
export const UMBRAL_CONCENTRACION_TOP5 = 0.5;

/** Cuantos clientes forman "los mayores" en la regla de concentracion. */
const MAYORES = 5;

const concentracionClientes: ReglaInsight = {
  id: "concentracion-clientes",
  nivel: "advertencia",
  descripcion: "Los cinco clientes mas grandes concentran mas de la mitad del ingreso.",
  evaluar(ctx) {
    const top5 = ctx.clientes.concentracion.top5;
    if (top5 === null || top5 <= UMBRAL_CONCENTRACION_TOP5) return null;

    // `detalle` ya viene ordenado por ingreso descendente.
    const mayores = ctx.clientes.detalle.slice(0, MAYORES);

    return crear(
      this,
      "Ingreso concentrado en pocos clientes",
      `Los ${mayores.length} clientes mas grandes concentran el ${pct(top5)} del ingreso del periodo, ` +
        `por encima del ${pct(UMBRAL_CONCENTRACION_TOP5)}: ` +
        `${lista(mayores.map((c) => `${c.nombre} ${pesos(c.ingreso)} (${pct(c.participacion, 1)})`), MAYORES)}. ` +
        `Perder una sola de estas cuentas mueve el resultado del periodo.`,
      mayores.map((c) => c.nombre),
    );
  },
};

const estacionalidad: ReglaInsight = {
  id: "meses-sin-venta",
  nivel: "nota",
  descripcion: "Hubo meses del periodo sin ninguna venta.",
  evaluar(ctx) {
    const sinVenta = ctx.flujo.mesesSinVenta;
    if (sinVenta.length === 0) return null;

    return crear(
      this,
      "Estacionalidad en las ventas",
      `No hubo ventas en ${sinVenta.length} ${sinVenta.length === 1 ? "mes" : "meses"} del periodo ` +
        `(${lista(sinVenta.map(mes), 6)}). Conviene revisar si es estacionalidad del giro o un hueco de captura.`,
      [...sinVenta],
    );
  },
};

/**
 * El mes que mas vendio y su peso en el periodo.
 *
 * La participacion se mide contra TODA la venta, incluidas las ventas sin
 * fecha: tambien ocurrieron en el periodo, aunque no se sepa en que mes. Con
 * un solo mes en el rango no hay nada que comparar y la regla no se dispara.
 * Si dos meses empatan gana el primero, para que el texto no cambie entre
 * corridas.
 */
const mesPico: ReglaInsight = {
  id: "mes-pico",
  nivel: "nota",
  descripcion: "Mes que concentra la mayor parte de la venta del periodo.",
  evaluar(ctx) {
    const fechados = ctx.flujo.meses.filter((m) => m.mes !== SIN_FECHA);
    if (fechados.length < 2) return null;

    let pico = fechados[0];
    for (const m of fechados) if (pico === undefined || m.facturado > pico.facturado) pico = m;
    if (pico === undefined || pico.facturado <= 0) return null;

    const participacion = divSegura(pico.facturado, ctx.flujo.facturadoTotal);
    const operaciones = ctx.resultados.total.operaciones;

    return crear(
      this,
      "Mes de mayor venta",
      `${mes(pico.mes)} concentra ${pico.operaciones} de ${operaciones} operaciones y ` +
        `${pesos(pico.facturado)} facturados: el ${pct(participacion)} del ingreso del periodo.`,
      [pico.mes],
    );
  },
};

/**
 * Los importes podrian traer IVA.
 *
 * Si la hoja parametros no lo contesta (null) o dice que si, la venta y la
 * utilidad bruta estan infladas por el impuesto trasladado, que no es ingreso.
 * La proporcion inflada es tasa / (1 + tasa): 13.8% con IVA de 16%. La
 * utilidad bruta escala igual que la venta si costo y precio llevan la misma
 * tasa; si no, su cifra sin IVA es aproximada.
 *
 * Con venta en cero no hay importe que pueda estar inflado y no se dispara.
 */
const importesConIva: ReglaInsight = {
  id: "importes-iva",
  nivel: "advertencia",
  descripcion: "No se sabe si los importes incluyen IVA, o se sabe que lo incluyen.",
  evaluar(ctx) {
    const incluye = ctx.dataset.parametros.importes_incluyen_iva;
    if (incluye === false) return null;

    const tasa = ctx.dataset.parametros.tasa_iva;
    const venta = ctx.resultados.total.ventaTotal;
    if (venta <= 0 || !(tasa > 0)) return null;

    const factor = 1 + tasa;
    const inflado = divSegura(tasa, factor);
    const bruta = ctx.resultados.total.utilidadBruta;
    const ventaSinIva = aCentavos(venta / factor);
    const brutaSinIva = aCentavos(bruta / factor);

    if (incluye === null) {
      return crear(
        this,
        "No se sabe si los importes incluyen IVA",
        `La hoja parametros no indica si los importes incluyen IVA. Si lo incluyen, la venta de ` +
          `${pesos(venta)} y la utilidad bruta de ${pesos(bruta)} estan sobrevaluadas en ` +
          `${pct(inflado, 1)}: sin IVA del ${pct(tasa)} serian ${pesos(ventaSinIva)} y ` +
          `${pesos(brutaSinIva)}. El resultado del periodo no es utilidad neta. Capture SI o NO ` +
          `en importes_incluyen_iva.`,
      );
    }

    return crear(
      this,
      "Los importes incluyen IVA",
      `Segun la hoja parametros, los importes incluyen IVA del ${pct(tasa)}. El IVA trasladado no ` +
        `es ingreso: la venta de ${pesos(venta)} equivale a ${pesos(ventaSinIva)} sin IVA y la ` +
        `utilidad bruta de ${pesos(bruta)} a ${pesos(brutaSinIva)}. Las cifras del reporte se ` +
        `muestran como se capturaron, sobrevaluadas en ${pct(inflado, 1)}.`,
    );
  },
};

// --------------------------- Reglas de apoyo ---------------------------

const ventasSinFecha: ReglaInsight = {
  id: "ventas-sin-fecha",
  nivel: "advertencia",
  descripcion: "Ventas que no pueden ubicarse en ningun mes.",
  evaluar(ctx) {
    const grupo = ctx.resultados.meses.find((m) => m.mes === SIN_FECHA);
    if (grupo === undefined || grupo.operaciones === 0) return null;

    return crear(
      this,
      "Ventas sin fecha",
      `${grupo.operaciones} ${grupo.operaciones === 1 ? "venta" : "ventas"} por ${pesos(grupo.ventaTotal)} ` +
        `no tienen fecha capturada: quedan fuera del analisis mensual y de la antiguedad de cartera. ` +
        `Se reportan aparte, no se descartan.`,
    );
  },
};

const carteraSinFecha: ReglaInsight = {
  id: "cartera-sin-fecha",
  nivel: "advertencia",
  descripcion: "Saldo que no puede clasificarse por antiguedad.",
  evaluar(ctx) {
    if (!hayCobranza(ctx)) return null;
    const monto = ctx.cartera.aging.porBucket[BUCKET_SIN_FECHA];
    if (monto <= 0) return null;

    const folios = ctx.cartera.detalle
      .filter((s) => s.bucket === BUCKET_SIN_FECHA && s.saldo > 0)
      .map((s) => s.folio);

    return crear(
      this,
      "Cartera sin antiguedad determinable",
      `${pesos(monto)} de saldo corresponden a ventas sin fecha: no se les puede calcular antiguedad ` +
        `y no entran en ningun bucket. Folios: ${lista(folios, 5)}.`,
      folios,
    );
  },
};

const demoSinReclasificar: ReglaInsight = {
  id: "filas-demo",
  nivel: "nota",
  descripcion: "Hay unidades Demo apartadas del analisis de venta.",
  evaluar(ctx) {
    const demos = ctx.resultados.excluidas.filter((e) => e.motivo === "demo");
    if (demos.length === 0) return null;

    const folios = demos.map((e) => e.venta.folio);
    const costo = demos.reduce((t, e) => t + (e.venta.costo_unitario ?? 0), 0);

    return crear(
      this,
      "Unidades Demo fuera del analisis",
      `${demos.length} ${demos.length === 1 ? "unidad" : "unidades"} marcadas como Demo ` +
        `(${lista(folios)}) quedan fuera de todo calculo de venta. Representan ${pesos(costo)} de costo ` +
        `que no tiene venta asociada: conviene decidir si son gasto de promocion o inventario.`,
      folios,
    );
  },
};

const equilibrioNoAlcanzado: ReglaInsight = {
  id: "punto-equilibrio",
  nivel: "advertencia",
  descripcion: "La venta del periodo no cubre el punto de equilibrio.",
  evaluar(ctx) {
    const pe = ctx.resultados.puntoEquilibrio;
    const venta = ctx.resultados.total.ventaTotal;
    if (pe === null || venta >= pe) return null;

    return crear(
      this,
      "Venta por debajo del punto de equilibrio",
      `El punto de equilibrio del periodo es ${pesos(pe)} y la venta fue ${pesos(venta)}: ` +
        `faltaron ${pesos(pe - venta)} para cubrir los gastos fijos de ${pesos(ctx.resultados.total.gastosFijos)}.`,
    );
  },
};

/** Todas las reglas. El orden define el orden de presentacion. */
/**
 * Sin cobranza, en lugar de las reglas de cartera: un solo aviso de que ese
 * analisis no esta disponible y de que falta capturar. Solo si hay venta: sin
 * venta no hay cartera que analizar y el aviso seria ruido.
 */
const carteraNoDisponible: ReglaInsight = {
  id: "cartera-no-disponible",
  nivel: "nota",
  descripcion: "Sin abonos capturados no puede saberse cuanto de la venta sigue pendiente.",
  evaluar(ctx) {
    if (hayCobranza(ctx) || ctx.resultados.total.operaciones === 0) return null;
    return crear(
      this,
      "Analisis de cartera no disponible",
      `No hay abonos capturados en la hoja cobranza, asi que no se sabe cuanto de la venta de ` +
        `${pesos(ctx.resultados.total.ventaTotal)} (${ctx.resultados.total.operaciones} operaciones) ya se cobro. ` +
        `Sin ese dato no se calculan saldo por cobrar, antiguedad de cartera, provision ni flujo. ` +
        `Capture en la hoja cobranza una fila por cada pago, con folio de venta, fecha y monto.`,
    );
  },
};

export const REGLAS_INSIGHT: readonly ReglaInsight[] = [
  utilidadEnCartera,
  carteraVencida,
  equilibrioNoAlcanzado,
  importesConIva,
  margenDerivado,
  ventasSinFecha,
  carteraSinFecha,
  carteraNoDisponible,
  attachBajo,
  concentracionClientes,
  estacionalidad,
  mesPico,
  demoSinReclasificar,
];

export interface OpcionesInsights {
  readonly fechaCorte: Date;
}

/** Arma el contexto una sola vez y lo pasa a todas las reglas. */
export function construirContexto(dataset: Dataset, opciones: OpcionesInsights): ContextoInsight {
  return {
    dataset,
    resultados: calcularResultados(dataset),
    cartera: calcularCartera(dataset, { fechaCorte: opciones.fechaCorte }),
    clientes: calcularClientes(dataset),
    producto: calcularProducto(dataset),
    flujo: calcularFlujo(dataset),
  };
}

/** Ejecuta todas las reglas y devuelve los hallazgos que se dispararon. */
export function calcularInsights(dataset: Dataset, opciones: OpcionesInsights): Insight[] {
  const ctx = construirContexto(dataset, opciones);
  return REGLAS_INSIGHT.map((r) => r.evaluar(ctx)).filter((i): i is Insight => i !== null);
}
