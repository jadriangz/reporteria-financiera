import type { Tono } from "../../components/ui/primitivas";
import type { Enfasis } from "../../components/ui/tabla";
import {
  type Cascada,
  type Centavos,
  type ClaveMes,
  type Resultados,
  aCentavos,
  divSegura,
} from "../../lib/calc";
import { type Gasto, norm } from "../../lib/schema";
import { ejeContinuo, mesesFechados } from "../compartido/ejeMensual";

/**
 * Logica de PRESENTACION del estado de resultados.
 *
 * Los importes de la cascada los calculo el motor; aqui se ordenan en
 * renglones, se les pone signo contable y se reparten en el eje mensual. La
 * unica agrupacion propia es el desglose de gastos por categoria, que el motor
 * no entrega: se prueba contra los totales del motor para que no pueda
 * divergir de ellos.
 */

// --------------------------- Cascada ---------------------------

export type ClaveConcepto =
  | "ingresos"
  | "costo"
  | "bruta"
  | "comisiones"
  | "contribucion"
  | "gastos"
  | "resultado";

/**
 * `deduccion` se resta en la cascada y se pinta entre parentesis. `resultado`
 * es un renglon "=" que puede salir negativo, y entonces se marca en riesgo.
 */
export type NaturalezaConcepto = "base" | "deduccion" | "resultado";

interface Concepto {
  readonly clave: ClaveConcepto;
  readonly concepto: string;
  readonly naturaleza: NaturalezaConcepto;
  readonly enfasis: Enfasis;
  /** Magnitud del concepto en la cascada, sin signo contable. */
  readonly magnitud: (c: Cascada) => Centavos;
}

/** Los renglones de la cascada, en el orden en que se leen. */
export const CONCEPTOS: readonly Concepto[] = [
  {
    clave: "ingresos",
    concepto: "Ingresos",
    naturaleza: "base",
    enfasis: "normal",
    magnitud: (c) => c.ventaTotal,
  },
  {
    clave: "costo",
    concepto: "(–) Costo de venta",
    naturaleza: "deduccion",
    enfasis: "normal",
    magnitud: (c) => c.costoTotal,
  },
  {
    clave: "bruta",
    concepto: "= Utilidad bruta",
    naturaleza: "resultado",
    enfasis: "subtotal",
    magnitud: (c) => c.utilidadBruta,
  },
  {
    clave: "comisiones",
    concepto: "(–) Comisiones",
    naturaleza: "deduccion",
    enfasis: "normal",
    magnitud: (c) => c.comisionTotal,
  },
  {
    clave: "contribucion",
    concepto: "= Utilidad de contribución",
    naturaleza: "resultado",
    enfasis: "subtotal",
    magnitud: (c) => c.utilidadContribucion,
  },
  {
    clave: "gastos",
    concepto: "(–) Gastos operativos",
    naturaleza: "deduccion",
    enfasis: "normal",
    magnitud: (c) => c.gastosTotal,
  },
  {
    clave: "resultado",
    concepto: "= Resultado",
    naturaleza: "resultado",
    enfasis: "total",
    magnitud: (c) => c.resultadoOperativo,
  },
];

/**
 * Importe con signo contable: las deducciones en negativo, para que la capa de
 * formato las pinte entre parentesis. Un cero se queda en cero positivo; `-0`
 * no se distingue al pintarlo, pero rompe una comparacion estricta.
 */
function importeContable(concepto: Concepto, cascada: Cascada): Centavos {
  const magnitud = concepto.magnitud(cascada);
  if (concepto.naturaleza !== "deduccion" || magnitud === 0) return magnitud;
  return -magnitud;
}

export interface FilaCascada {
  readonly clave: ClaveConcepto;
  readonly concepto: string;
  readonly naturaleza: NaturalezaConcepto;
  readonly enfasis: Enfasis;
  /** Con signo contable: deducciones en negativo. */
  readonly importe: Centavos;
  /**
   * Proporcion sobre la venta. Las deducciones van en positivo, como en el
   * reporte de referencia ("80.0%" junto a un costo entre parentesis); los
   * renglones de resultado conservan su signo. null si no hubo venta.
   */
  readonly pctVenta: number | null;
  readonly tono: Tono;
}

/** Un renglon "=" negativo es una perdida y se marca. Nada mas se colorea. */
function tonoDe(naturaleza: NaturalezaConcepto, importe: Centavos): Tono {
  return naturaleza === "resultado" && importe < 0 ? "riesgo" : "neutro";
}

/** La cascada del periodo, renglon por renglon. */
export function construirCascada(cascada: Cascada): readonly FilaCascada[] {
  return CONCEPTOS.map((c): FilaCascada => {
    const importe = importeContable(c, cascada);
    return {
      clave: c.clave,
      concepto: c.concepto,
      naturaleza: c.naturaleza,
      enfasis: c.enfasis,
      importe,
      pctVenta: divSegura(c.magnitud(cascada), cascada.ventaTotal),
      tono: tonoDe(c.naturaleza, importe),
    };
  });
}

// --------------------------- Cascada mensual ---------------------------

export interface FilaCascadaMensual {
  readonly clave: ClaveConcepto;
  readonly concepto: string;
  readonly enfasis: Enfasis;
  /** Importe con signo contable en cada columna del eje. */
  readonly porMes: Readonly<Record<ClaveMes, Centavos>>;
  /** El total del periodo, tal como lo entrega el motor. */
  readonly total: Centavos;
  readonly tono: Tono;
}

export interface CascadaMensual {
  /** Eje continuo: meses sin actividad incluidos y el grupo sin fecha al final. */
  readonly columnas: readonly ClaveMes[];
  readonly filas: readonly FilaCascadaMensual[];
}

/**
 * La misma cascada, mes por mes.
 *
 * Las ventas y gastos sin fecha llegan del motor en su propio grupo y aqui
 * ocupan la ultima columna, "Sin fecha": nunca se reparten entre los meses ni
 * se esconden. Un mes del rango sin ventas ni gastos se muestra en cero, con
 * el mismo eje continuo que usa Ventas y flujo.
 *
 * El total de cada renglon es el del motor, no una suma de las columnas: la
 * prueba exige que ambos coincidan.
 */
export function cascadaMensual(resultados: Resultados): CascadaMensual {
  const columnas = ejeContinuo(resultados.meses.map((m) => m.mes));
  const porClave = new Map(resultados.meses.map((m) => [m.mes, m]));

  const filas = CONCEPTOS.map((c): FilaCascadaMensual => {
    const porMes: Record<ClaveMes, Centavos> = {};
    for (const mes of columnas) {
      const cascada = porClave.get(mes);
      porMes[mes] = cascada === undefined ? 0 : importeContable(c, cascada);
    }
    const total = importeContable(c, resultados.total);
    return {
      clave: c.clave,
      concepto: c.concepto,
      enfasis: c.enfasis,
      porMes,
      total,
      tono: tonoDe(c.naturaleza, total),
    };
  });

  return { columnas, filas };
}

// --------------------------- Punto de equilibrio ---------------------------

/** Por que no hay punto de equilibrio que mostrar, o por que no es mensual. */
export type MotivoSinEquilibrio = "sin-gastos-fijos" | "sin-venta" | "margen-no-positivo" | "sin-fechas";

export const TEXTO_SIN_EQUILIBRIO: Readonly<Record<MotivoSinEquilibrio, string>> = {
  "sin-gastos-fijos":
    "No hay gastos fijos capturados: sin costos fijos que cubrir, el punto de equilibrio no aplica. Capture nómina, renta y servicios en la hoja gastos con tipo «Fijo».",
  "sin-venta":
    "No hay venta computable en el periodo: sin margen de contribución no hay contra qué medir los gastos fijos.",
  "margen-no-positivo":
    "El margen de contribución es cero o negativo: cada venta aporta nada o resta, y ningún volumen alcanza a cubrir los gastos fijos.",
  "sin-fechas":
    "Ninguna venta ni gasto tiene fecha: el equilibrio del periodo existe, pero no puede repartirse por mes.",
};

export interface LecturaEquilibrio {
  /** Punto de equilibrio del periodo completo, tal como lo da el motor. */
  readonly periodo: Centavos | null;
  /** Meses fechados del eje: el divisor de todas las cifras mensuales. */
  readonly meses: number;
  readonly mensual: Centavos | null;
  readonly ventaPromedioMensual: Centavos | null;
  readonly gastosFijosMensuales: Centavos | null;
  /** utilidad_contribucion / venta_total: el denominador del equilibrio. */
  readonly margenContribucion: number | null;
  /** Venta promedio menos equilibrio. Negativo = no se cubren los fijos. */
  readonly holgura: Centavos | null;
  readonly motivo: MotivoSinEquilibrio | null;
}

function mensualizar(importe: Centavos, meses: number): Centavos | null {
  const r = divSegura(importe, meses);
  return r === null ? null : aCentavos(r);
}

/**
 * Punto de equilibrio expresado por mes, contra la venta promedio real.
 *
 * El motor da el equilibrio del periodo completo. Para leerlo por mes se
 * divide entre los meses del eje mensual (del primer al ultimo mes con venta o
 * gasto fechado), los mismos que muestra la vista mensual: el lector puede
 * contar las columnas y llegar al mismo divisor. La venta promedio usa el
 * mismo divisor, asi que la comparacion no depende de cual se elija.
 *
 * El motivo del null se deduce en el mismo orden en que se le explicaria a una
 * persona: primero si hay fijos que cubrir, luego si hay venta, luego margen.
 */
export function leerEquilibrio(resultados: Resultados): LecturaEquilibrio {
  const { total, puntoEquilibrio } = resultados;
  const meses = mesesFechados(ejeContinuo(resultados.meses.map((m) => m.mes)));
  const margenContribucion = divSegura(total.utilidadContribucion, total.ventaTotal);

  let motivo: MotivoSinEquilibrio | null = null;
  if (puntoEquilibrio === null) {
    if (total.gastosFijos <= 0) motivo = "sin-gastos-fijos";
    else if (total.ventaTotal <= 0) motivo = "sin-venta";
    else motivo = "margen-no-positivo";
  } else if (meses === 0) {
    motivo = "sin-fechas";
  }

  const mensual = puntoEquilibrio === null ? null : mensualizar(puntoEquilibrio, meses);
  const ventaPromedioMensual = mensualizar(total.ventaTotal, meses);

  return {
    periodo: puntoEquilibrio,
    meses,
    mensual,
    ventaPromedioMensual,
    gastosFijosMensuales: mensualizar(total.gastosFijos, meses),
    margenContribucion,
    holgura:
      mensual === null || ventaPromedioMensual === null ? null : ventaPromedioMensual - mensual,
    motivo,
  };
}

// --------------------------- Gastos por categoria ---------------------------

export type TipoGastoVista = "fijo" | "variable";

/**
 * Fijo o variable, con LA MISMA regla que el motor (`resultados.ts`): un gasto
 * es fijo salvo que diga "variable". Si esta regla cambia alla sin cambiar
 * aqui, el desglose deja de cuadrar con la cascada, y la prueba de cuadre lo
 * detecta.
 */
export function tipoDeGasto(gasto: Gasto): TipoGastoVista {
  return (gasto.tipo?.trim().toLowerCase() ?? "fijo") === "variable" ? "variable" : "fijo";
}

/** ¿El tipo capturado es uno de los dos reconocidos? Si no, se avisa. */
function tipoReconocido(gasto: Gasto): boolean {
  const t = gasto.tipo?.trim().toLowerCase();
  return t === "fijo" || t === "variable";
}

export const SIN_CATEGORIA = "Sin categoría";
export const SIN_SUBCATEGORIA = "Sin subcategoría";

export interface SubcategoriaGasto {
  readonly clave: string;
  readonly nombre: string;
  readonly monto: Centavos;
  readonly registros: number;
  /** Proporcion dentro de su categoria. */
  readonly pctCategoria: number | null;
}

export interface CategoriaGasto {
  readonly clave: string;
  readonly nombre: string;
  readonly tipo: TipoGastoVista;
  readonly monto: Centavos;
  readonly registros: number;
  /** Proporcion sobre el total de gastos, fijos y variables juntos. */
  readonly pctTotal: number | null;
  readonly subcategorias: readonly SubcategoriaGasto[];
}

export interface GrupoGasto {
  readonly tipo: TipoGastoVista;
  readonly monto: Centavos;
  readonly registros: number;
  readonly pctTotal: number | null;
  /** Ordenadas por monto descendente. */
  readonly categorias: readonly CategoriaGasto[];
}

export interface DesgloseGastos {
  /** Siempre dos grupos, fijos primero, aunque alguno este vacio. */
  readonly grupos: readonly GrupoGasto[];
  readonly total: Centavos;
  /** Registros sin monto: no suman y no aparecen en el desglose. */
  readonly sinMonto: number;
  /** Registros con monto cuyo tipo falta o no se reconoce: cuentan como fijos. */
  readonly sinTipo: number;
}

interface Acumulado {
  nombre: string;
  monto: number;
  registros: number;
}

function acumular(mapa: Map<string, Acumulado>, clave: string, nombre: string, monto: number): void {
  const a = mapa.get(clave);
  if (a === undefined) {
    mapa.set(clave, { nombre, monto, registros: 1 });
    return;
  }
  a.monto += monto;
  a.registros += 1;
}

const porMontoDesc = (a: { monto: number; nombre: string }, b: { monto: number; nombre: string }) =>
  b.monto - a.monto || a.nombre.localeCompare(b.nombre, "es-MX");

/**
 * Gastos agrupados por tipo, categoria y subcategoria.
 *
 * Las categorias se agrupan por nombre normalizado ("  nomina " y "Nomina" son
 * la misma) y se muestran con el primer nombre capturado. La categoria vacia
 * se nombra "Sin categoría": no se descarta ni se reparte.
 */
export function desgloseGastos(gastos: readonly Gasto[]): DesgloseGastos {
  const categorias = new Map<string, Acumulado & { tipo: TipoGastoVista; subs: Map<string, Acumulado> }>();
  let sinMonto = 0;
  let sinTipo = 0;
  let total = 0;

  for (const gasto of gastos) {
    if (gasto.monto === null) {
      sinMonto += 1;
      continue;
    }
    if (!tipoReconocido(gasto)) sinTipo += 1;

    const tipo = tipoDeGasto(gasto);
    const nombreCat = gasto.categoria?.trim() || SIN_CATEGORIA;
    const nombreSub = gasto.subcategoria?.trim() || SIN_SUBCATEGORIA;
    const claveCat = `${tipo}|${norm(nombreCat)}`;

    let cat = categorias.get(claveCat);
    if (cat === undefined) {
      cat = { nombre: nombreCat, monto: 0, registros: 0, tipo, subs: new Map() };
      categorias.set(claveCat, cat);
    }
    cat.monto += gasto.monto;
    cat.registros += 1;
    acumular(cat.subs, norm(nombreSub), nombreSub, gasto.monto);
    total += gasto.monto;
  }

  const grupos = (["fijo", "variable"] as const).map((tipo): GrupoGasto => {
    const deTipo = [...categorias.entries()]
      .filter(([, c]) => c.tipo === tipo)
      .map(
        ([clave, c]): CategoriaGasto => ({
          clave,
          nombre: c.nombre,
          tipo,
          monto: c.monto,
          registros: c.registros,
          pctTotal: divSegura(c.monto, total),
          subcategorias: [...c.subs.entries()]
            .map(
              ([claveSub, s]): SubcategoriaGasto => ({
                clave: claveSub,
                nombre: s.nombre,
                monto: s.monto,
                registros: s.registros,
                pctCategoria: divSegura(s.monto, c.monto),
              }),
            )
            .sort(porMontoDesc),
        }),
      )
      .sort(porMontoDesc);

    let monto = 0;
    let registros = 0;
    for (const c of deTipo) {
      monto += c.monto;
      registros += c.registros;
    }
    return { tipo, monto, registros, pctTotal: divSegura(monto, total), categorias: deTipo };
  });

  return { grupos, total, sinMonto, sinTipo };
}

export const NOMBRE_GRUPO: Readonly<Record<TipoGastoVista, string>> = {
  fijo: "Gastos fijos",
  variable: "Gastos variables",
};

/** Renglon de la tabla de gastos: un encabezado de grupo o una categoria. */
export interface FilaGasto {
  readonly id: string;
  readonly nivel: "grupo" | "categoria";
  readonly nombre: string;
  readonly registros: number;
  readonly monto: Centavos;
  readonly pctTotal: number | null;
  /** Vacio en los encabezados de grupo: no tienen detalle que desplegar. */
  readonly subcategorias: readonly SubcategoriaGasto[];
}

/** Fila de pie de la tabla de gastos. */
export function filaTotalGastos(desglose: DesgloseGastos): FilaGasto {
  let registros = 0;
  for (const g of desglose.grupos) registros += g.registros;
  return {
    id: "total",
    nivel: "grupo",
    nombre: "Total gastos",
    registros,
    monto: desglose.total,
    pctTotal: divSegura(desglose.total, desglose.total),
    subcategorias: [],
  };
}

/** Aplana el desglose en renglones: cada grupo seguido de sus categorias. */
export function filasGastos(desglose: DesgloseGastos): readonly FilaGasto[] {
  return desglose.grupos.flatMap((g): FilaGasto[] => [
    {
      id: `grupo-${g.tipo}`,
      nivel: "grupo",
      nombre: NOMBRE_GRUPO[g.tipo],
      registros: g.registros,
      monto: g.monto,
      pctTotal: g.pctTotal,
      subcategorias: [],
    },
    ...g.categorias.map(
      (c): FilaGasto => ({
        id: c.clave,
        nivel: "categoria",
        nombre: c.nombre,
        registros: c.registros,
        monto: c.monto,
        pctTotal: c.pctTotal,
        subcategorias: c.subcategorias,
      }),
    ),
  ]);
}
