import {
  ANIO_MAXIMO,
  ANIO_MINIMO,
  ENUMERACIONES,
  type Hallazgo,
  LINEA,
  type Severidad,
  canonizar,
  parseEnteroNoNegativo,
  parseFecha,
  parseMonto,
  parsePct,
} from "../schema";

import { type ConflictoCabecera, folioDe } from "./cabecera";
import { CLAVES_PARAMETROS, LECTURAS, type ParametroSustituido, REGLA_PORCENTAJE, sinCapturar } from "./parametros";
import { COLUMNAS_MONTO, HOJAS_TABULARES, type NombreHoja, type RawCelda, type RawSheets } from "./tipos";

/**
 * Los hallazgos son datos, no cadenas sueltas repartidas por el lector: cada
 * regla es un objeto declarativo que recorre el contexto y devuelve una lista.
 * Anadir una regla es anadir un elemento a REGLAS, nunca un `if` en otro sitio.
 */
export interface Regla {
  readonly id: string;
  readonly severidad: Severidad;
  /** Que comprueba, en una linea. Sirve de documentacion viva. */
  readonly descripcion: string;
  evaluar(ctx: ContextoValidacion): Hallazgo[];
}

/** Una fila cruda emparejada con el resultado de aplicarle el esquema Zod. */
export interface FilaEvaluada {
  readonly fila: number;
  /**
   * Lo que entro al esquema. En `ventas` trae la cabecera del folio ya puesta
   * (`cabecera.ts`); en las demas hojas es la fila tal cual.
   */
  readonly valores: Readonly<Record<string, RawCelda>>;
  /** Lo que el usuario escribio en ESTA fila. Para los avisos que citan lo capturado. */
  readonly capturados: Readonly<Record<string, RawCelda>>;
  /** false si Zod rechazo la fila. */
  readonly cumpleEsquema: boolean;
  /**
   * Si la fila entra al Dataset. En `ventas` puede ser false aunque la fila
   * cumpla el esquema: sale con todo su folio (`foliosExcluidos`).
   */
  readonly aceptada: boolean;
}

/** Un folio de varias partidas que sale completo del Dataset. */
export type FolioExcluido =
  | {
      readonly folio: string;
      readonly motivo: "cliente-en-conflicto";
      readonly filas: readonly number[];
      readonly capturas: ConflictoCabecera["capturas"];
    }
  | {
      readonly folio: string;
      readonly motivo: "partida-ilegible";
      readonly filas: readonly number[];
      /** Las filas que no cumplen el esquema y rompen el folio. */
      readonly ilegibles: readonly number[];
    };

export interface ContextoValidacion {
  readonly raw: RawSheets;
  readonly ventas: readonly FilaEvaluada[];
  readonly cobranza: readonly FilaEvaluada[];
  readonly gastos: readonly FilaEvaluada[];
  /** `dias_credito`, `condicion` o `vendedor` distintos dentro de un folio: se aplico el primero. */
  readonly conflictos: readonly ConflictoCabecera[];
  readonly foliosExcluidos: readonly FolioExcluido[];
  /** Parametros que no se pudieron leer. `validate()` los calcula una vez; de ahi salen el aviso y la interfaz. */
  readonly sustituciones: readonly ParametroSustituido[];
}

// --------------------------- Utilidades de las reglas ---------------------------

/** Columnas de fecha por hoja. Se coercionan con parseFecha. */
const COLUMNAS_FECHA: Readonly<Record<NombreHoja, readonly string[]>> = {
  ventas: ["fecha"],
  cobranza: ["fecha_pago"],
  gastos: ["fecha"],
};

/** Columnas de porcentaje por hoja. Se coercionan con parsePct. */
const COLUMNAS_PCT: Readonly<Record<NombreHoja, readonly string[]>> = {
  ventas: ["comision_pct"],
  cobranza: [],
  gastos: [],
};

/** Acepta `undefined` porque indexar un Record puede no encontrar la columna. */
function vacia(c: RawCelda | undefined): boolean {
  return c === null || c === undefined || String(c).trim() === "";
}

function filasDe(ctx: ContextoValidacion, hoja: NombreHoja): readonly FilaEvaluada[] {
  return hoja === "ventas" ? ctx.ventas : hoja === "cobranza" ? ctx.cobranza : ctx.gastos;
}

function texto(c: RawCelda | undefined): string {
  return String(c ?? "").trim();
}

/** Constructor de hallazgos. Omite `fila`/`campo` en vez de pasarlos undefined. */
function hallazgo(
  severidad: Severidad,
  hoja: Hallazgo["hoja"],
  mensaje: string,
  extra: { fila?: number; campo?: string; accion?: string } = {},
): Hallazgo {
  const h: Hallazgo = { severidad, hoja, mensaje };
  return {
    ...h,
    ...(extra.fila === undefined ? {} : { fila: extra.fila }),
    ...(extra.campo === undefined ? {} : { campo: extra.campo }),
    ...(extra.accion === undefined ? {} : { accion: extra.accion }),
  };
}

// --------------------------- Reglas de ERROR ---------------------------

/**
 * Un importe que el cliente SI escribio pero que no se pudo leer: texto que no
 * es numero, o un numero con otra gramatica que la europea del contrato
 * ("1,234.56", "1234.56"). Se distingue de la celda vacia preguntandole al
 * esquema: si habia texto y la coercion devolvio null, no se pudo leer. Error
 * por su consecuencia: sin importe, la venta, el abono o el gasto no se suman.
 */
const valorNoNumerico: Regla = {
  id: "valor-no-numerico",
  severidad: "error",
  descripcion: "Celda de importe con contenido que no se puede leer como importe.",
  evaluar(ctx) {
    const out: Hallazgo[] = [];
    for (const hoja of HOJAS_TABULARES) {
      for (const f of filasDe(ctx, hoja)) {
        for (const campo of COLUMNAS_MONTO[hoja]) {
          const crudo = f.valores[campo] ?? null;
          if (vacia(crudo) || parseMonto(crudo) !== null) continue;
          out.push(
            hallazgo("error", hoja, `El importe "${texto(crudo)}" no es un numero valido.`, {
              fila: f.fila,
              campo,
              accion:
                `Escriba ${campo} con punto para miles y coma para decimales: 444800, 444.800 o ` +
                `$ 444.800,00. Un importe como 1,234.56 o 1234.56 no se adivina. Borre el texto si no aplica.`,
            }),
          );
        }
      }
    }
    return out;
  },
};

/** Fecha escrita pero ilegible, o fuera de 1990–2100. La celda vacia es advertencia, no error. */
const fechaInvalida: Regla = {
  id: "fecha-invalida",
  severidad: "error",
  descripcion: "Celda de fecha con contenido que no corresponde a una fecha real.",
  evaluar(ctx) {
    const out: Hallazgo[] = [];
    for (const hoja of HOJAS_TABULARES) {
      for (const f of filasDe(ctx, hoja)) {
        for (const campo of COLUMNAS_FECHA[hoja]) {
          const crudo = f.valores[campo] ?? null;
          if (vacia(crudo) || parseFecha(crudo) !== null) continue;
          out.push(
            hallazgo("error", hoja, `La fecha "${texto(crudo)}" no es valida.`, {
              fila: f.fila,
              campo,
              accion: `Escriba ${campo} en formato dd/mm/aaaa, por ejemplo 31/01/2026, entre ${ANIO_MINIMO} y ${ANIO_MAXIMO}.`,
            }),
          );
        }
      }
    }
    return out;
  },
};

// Desde la v1.2.0 repetir el folio no es un error: es como se captura una venta
// con varias partidas. De la regla `folio-duplicado` queda lo que si impide
// valuar un folio: no saber de quien es, o no poder leer una de sus partidas.

/** "$24,000", para los mensajes. Sin centavos: aqui importa el orden de magnitud. */
function pesos(centavos: number): string {
  return `${centavos < 0 ? "-" : ""}$${Math.round(Math.abs(centavos) / 100).toLocaleString("es-MX")}`;
}

/** "2", "2 y 3", "2, 3 y 4". */
function enumerar(filas: readonly number[]): string {
  if (filas.length <= 1) return filas.join("");
  return `${filas.slice(0, -1).join(", ")} y ${filas[filas.length - 1]}`;
}

/** Venta legible de un folio, sumando sus partidas. */
function ventaLegible(ctx: ContextoValidacion, folio: string): number {
  let total = 0;
  for (const f of ctx.ventas) {
    if (folioDe(f.valores) === folio) total += parseMonto(f.valores["precio_venta"] ?? null) ?? 0;
  }
  return total;
}

/**
 * Lo que pasa con los abonos de un folio que sale del analisis. Se conservan en
 * el Dataset —la exportacion no se los quita al cliente— y el motor no los
 * aplica a nada. Antes eso pasaba en silencio; aqui se dice cuantos son y cuanto
 * suman.
 */
function abonosSinAplicar(ctx: ContextoValidacion, folio: string): string {
  const filas: number[] = [];
  let monto = 0;
  for (const f of ctx.cobranza) {
    if (texto(f.valores["folio_venta"]) !== folio) continue;
    filas.push(f.fila);
    monto += parseMonto(f.valores["monto"] ?? null) ?? 0;
  }
  if (filas.length === 0) return "";
  return filas.length === 1
    ? ` Su abono por ${pesos(monto)} (hoja cobranza, fila ${filas[0]}) queda sin aplicar.`
    : ` Sus ${filas.length} abonos por ${pesos(monto)} (hoja cobranza, filas ${enumerar(filas)}) quedan sin aplicar.`;
}

function capturasTexto(capturas: ConflictoCabecera["capturas"]): string {
  return capturas.map((c) => `fila ${c.fila}: "${c.capturado}"`).join("; ");
}

const clienteEnConflicto: Regla = {
  id: "cliente-en-conflicto",
  severidad: "error",
  descripcion: "Las partidas de un folio traen clientes distintos: el folio completo queda fuera.",
  evaluar(ctx) {
    const out: Hallazgo[] = [];
    for (const f of ctx.foliosExcluidos) {
      if (f.motivo !== "cliente-en-conflicto") continue;
      const primera = f.capturas[0];
      const distinta = f.capturas.find((c) => c.capturado !== primera?.capturado) ?? primera;
      out.push(
        hallazgo(
          "error",
          "ventas",
          `El folio ${f.folio} trae clientes distintos en sus partidas (${capturasTexto(f.capturas)}): no se sabe ` +
            `de quien es la venta, y el folio completo queda fuera del analisis (filas ${enumerar(f.filas)}, ` +
            `${pesos(ventaLegible(ctx, f.folio))} de venta).${abonosSinAplicar(ctx, f.folio)}`,
          {
            ...(distinta === undefined ? {} : { fila: distinta.fila }),
            campo: "cliente",
            accion:
              `Escriba el mismo cliente en todas las partidas del folio ${f.folio}, o deles folios distintos ` +
              `si son ventas distintas.`,
          },
        ),
      );
    }
    return out;
  },
};

const folioIncompleto: Regla = {
  id: "folio-incompleto",
  severidad: "error",
  descripcion: "Una partida de un folio no se pudo leer: el folio completo queda fuera.",
  evaluar(ctx) {
    const out: Hallazgo[] = [];
    for (const f of ctx.foliosExcluidos) {
      if (f.motivo !== "partida-ilegible") continue;
      const rota = f.ilegibles.length === 1 ? `La fila ${f.ilegibles[0]}` : `Las filas ${enumerar(f.ilegibles)}`;
      out.push(
        hallazgo(
          "error",
          "ventas",
          `${rota} del folio ${f.folio} no ${f.ilegibles.length === 1 ? "se pudo" : "se pudieron"} leer, y sin ` +
            `${f.ilegibles.length === 1 ? "ella" : "ellas"} el folio no se puede valuar: sus ${f.filas.length} ` +
            `partidas quedan fuera del analisis (filas ${enumerar(f.filas)}, ${pesos(ventaLegible(ctx, f.folio))} ` +
            `de venta legible).${abonosSinAplicar(ctx, f.folio)}`,
          {
            ...(f.ilegibles[0] === undefined ? {} : { fila: f.ilegibles[0] }),
            campo: "folio",
            accion:
              `Corrija ${f.ilegibles.length === 1 ? "esa fila" : "esas filas"} (revise que tenga modelo) y el ` +
              `folio ${f.folio} completo vuelve a entrar.`,
          },
        ),
      );
    }
    return out;
  },
};

const cobranzaHuerfana: Regla = {
  id: "cobranza-sin-venta",
  severidad: "error",
  descripcion: "Un abono apunta a un folio de venta que no existe en la hoja ventas.",
  evaluar(ctx) {
    const folios = new Set(ctx.ventas.map((f) => texto(f.valores["folio"])));
    const out: Hallazgo[] = [];
    for (const f of ctx.cobranza) {
      const ref = texto(f.valores["folio_venta"]);
      if (ref === "" || folios.has(ref)) continue;
      out.push(
        hallazgo("error", "cobranza", `El abono apunta a la venta ${ref}, que no existe.`, {
          fila: f.fila,
          campo: "folio_venta",
          accion: `Corrija folio_venta para que coincida con un folio de la hoja ventas, o capture la venta faltante.`,
        }),
      );
    }
    return out;
  },
};

/** Filas que el esquema del contrato rechazo y por tanto no entran al Dataset. */
const filaRechazada: Regla = {
  id: "fila-rechazada",
  severidad: "error",
  descripcion: "La fila no cumple el contrato de datos y queda fuera del analisis.",
  evaluar(ctx) {
    const out: Hallazgo[] = [];
    for (const hoja of HOJAS_TABULARES) {
      for (const f of filasDe(ctx, hoja)) {
        if (f.cumpleEsquema) continue;
        out.push(
          hallazgo("error", hoja, `La fila no cumple el formato esperado y fue excluida.`, {
            fila: f.fila,
            accion: `Revise que la fila tenga folio, cliente y modelo. Complete los campos obligatorios.`,
          }),
        );
      }
    }
    return out;
  },
};

// --------------------------- Reglas de ADVERTENCIA ---------------------------

const filaSinFecha: Regla = {
  id: "fila-sin-fecha",
  severidad: "advertencia",
  descripcion: "Fila sin fecha: no puede ubicarse en el tiempo ni entrar en la estacionalidad.",
  evaluar(ctx) {
    const out: Hallazgo[] = [];
    for (const hoja of HOJAS_TABULARES) {
      for (const f of filasDe(ctx, hoja)) {
        for (const campo of COLUMNAS_FECHA[hoja]) {
          if (!vacia(f.valores[campo] ?? null)) continue;
          out.push(
            hallazgo("advertencia", hoja, `Falta ${campo}: la fila queda fuera del analisis mensual.`, {
              fila: f.fila,
              campo,
              accion: `Capture ${campo} en formato dd/mm/aaaa.`,
            }),
          );
        }
      }
    }
    return out;
  },
};

const ventaSinDiasCredito: Regla = {
  id: "venta-sin-dias-credito",
  severidad: "advertencia",
  descripcion: "Sin dias de credito la antiguedad se mide desde la venta, no desde el vencimiento.",
  evaluar(ctx) {
    const out: Hallazgo[] = [];
    for (const f of ctx.ventas) {
      if (!vacia(f.valores["dias_credito"] ?? null)) continue;
      out.push(
        hallazgo(
          "advertencia",
          "ventas",
          `Sin dias_credito: el aging de esta venta se calculara por antiguedad, no por vencimiento.`,
          {
            fila: f.fila,
            campo: "dias_credito",
            accion: `Capture los dias de credito pactados, por ejemplo 90.`,
          },
        ),
      );
    }
    return out;
  },
};

/**
 * dias_credito capturado que no es un entero no negativo. Antes entraba como NaN
 * ("30dias") o como -5 y alimentaba el aging sin aviso; ahora el esquema lo deja
 * vacio y aqui se dice. Advertencia por su consecuencia: sin dias de credito la
 * venta se mide por antiguedad, igual que con la celda vacia.
 */
const diasCreditoIlegible: Regla = {
  id: "dias-credito-ilegible",
  severidad: "advertencia",
  descripcion: "dias_credito que no es un numero entero de dias: la venta se mide por antiguedad.",
  evaluar(ctx) {
    const out: Hallazgo[] = [];
    for (const f of ctx.ventas) {
      // Lo capturado en ESTA fila: la cabecera del folio pudo haberla sustituido.
      const crudo = f.capturados["dias_credito"] ?? null;
      if (!f.aceptada || vacia(crudo) || parseEnteroNoNegativo(crudo) !== null) continue;
      const delFolio = parseEnteroNoNegativo(f.valores["dias_credito"] ?? null);
      out.push(
        hallazgo(
          "advertencia",
          "ventas",
          `dias_credito dice "${texto(crudo)}", que no es un numero entero de dias: ` +
            (delFolio === null
              ? `el aging de esta venta se calcula por antiguedad, igual que sin dias_credito.`
              : `se aplican los ${delFolio} dias de las demas partidas de su folio.`),
          { fila: f.fila, campo: "dias_credito", accion: "Escriba los dias de credito pactados como numero entero, por ejemplo 90." },
        ),
      );
    }
    return out;
  },
};

/**
 * Porcentaje capturado que no se puede leer, o fuera de 0–100% ("150" se aceptaba
 * como 150%). Advertencia por su consecuencia: la venta se calcula sin comision,
 * igual que con la celda vacia; nada queda bloqueado.
 */
const porcentajeIlegible: Regla = {
  id: "porcentaje-ilegible",
  severidad: "advertencia",
  descripcion: "Porcentaje que no se puede leer o fuera de 0-100%: se toma como celda vacia.",
  evaluar(ctx) {
    const out: Hallazgo[] = [];
    for (const hoja of HOJAS_TABULARES) {
      for (const f of filasDe(ctx, hoja)) {
        for (const campo of COLUMNAS_PCT[hoja]) {
          const crudo = f.valores[campo] ?? null;
          if (!f.aceptada || vacia(crudo) || parsePct(crudo) !== null) continue;
          out.push(
            hallazgo(
              "advertencia",
              hoja,
              `${campo} dice "${texto(crudo)}", que no se pudo leer como un porcentaje entre 0% y 100%: ` +
                `la venta se calcula sin comision, igual que con la celda vacia.`,
              { fila: f.fila, campo, accion: `Escriba ${campo} como porcentaje: ${REGLA_PORCENTAJE}.` },
            ),
          );
        }
      }
    }
    return out;
  },
};

const abonoExcedePrecio: Regla = {
  id: "abono-excede-precio",
  severidad: "advertencia",
  descripcion: "Lo cobrado de una venta supera su precio: sobra dinero o falta capturar el precio.",
  evaluar(ctx) {
    // El precio de una venta es el de su folio: la suma de sus partidas.
    const precio = new Map<string, number>();
    for (const f of ctx.ventas) {
      const folio = texto(f.valores["folio"]);
      const monto = parseMonto(f.valores["precio_venta"] ?? null);
      // Solo lo que el motor va a cobrar: ni un folio excluido ni una partida Demo.
      if (!f.aceptada || canonizar(LINEA, f.valores["linea"]) === "Demo") continue;
      if (folio !== "" && monto !== null) precio.set(folio, (precio.get(folio) ?? 0) + monto);
    }

    const cobrado = new Map<string, number>();
    const filaUltima = new Map<string, number>();
    for (const f of ctx.cobranza) {
      const ref = texto(f.valores["folio_venta"]);
      const monto = parseMonto(f.valores["monto"] ?? null);
      if (ref === "" || monto === null) continue;
      cobrado.set(ref, (cobrado.get(ref) ?? 0) + monto);
      filaUltima.set(ref, f.fila);
    }

    const out: Hallazgo[] = [];
    for (const [folio, total] of cobrado) {
      const pv = precio.get(folio);
      if (pv === undefined || total <= pv) continue;
      const fila = filaUltima.get(folio);
      out.push(
        hallazgo(
          "advertencia",
          "cobranza",
          `Los abonos de ${folio} suman mas que su precio de venta.`,
          {
            ...(fila === undefined ? {} : { fila }),
            campo: "monto",
            accion: `Revise los abonos de ${folio} o corrija precio_venta en la hoja ventas.`,
          },
        ),
      );
    }
    return out;
  },
};

/**
 * `dias_credito`, `condicion` o `vendedor` distintos dentro de un folio. Vale el
 * primero capturado y se dice cual. Advertencia: la venta se calcula.
 */
const cabeceraEnConflicto: Regla = {
  id: "cabecera-en-conflicto",
  severidad: "advertencia",
  descripcion: "Un dato de cabecera distinto entre partidas de un folio: se aplica el primero capturado.",
  evaluar(ctx) {
    const fuera = new Set(ctx.foliosExcluidos.map((f) => f.folio));
    const out: Hallazgo[] = [];
    for (const c of ctx.conflictos) {
      const primera = c.capturas[0];
      if (primera === undefined || fuera.has(c.folio)) continue;
      const distinta = c.capturas.find((x) => x.capturado !== primera.capturado) ?? primera;
      out.push(
        hallazgo(
          "advertencia",
          "ventas",
          `El folio ${c.folio} trae ${c.campo} distinto en sus partidas (${capturasTexto(c.capturas)}): ` +
            `se aplica "${primera.capturado}", el de la fila ${primera.fila}, a todo el folio.`,
          {
            fila: distinta.fila,
            campo: c.campo,
            accion: `Deje ${c.campo} igual en todas las partidas del folio ${c.folio}, o vacio en las que heredan.`,
          },
        ),
      );
    }
    return out;
  },
};

/**
 * Una partida Demo dentro de un folio que tambien trae ventas. La Demo se
 * excluye como siempre; lo que hay que decir es que los pagos del folio se
 * aplican completos a las partidas que si cuentan.
 */
const demoEnFolio: Regla = {
  id: "demo-en-folio",
  severidad: "advertencia",
  descripcion: "Partida Demo en un folio con ventas: los pagos se aplican solo a las partidas que cuentan.",
  evaluar(ctx) {
    const esDemo = (f: FilaEvaluada): boolean => canonizar(LINEA, f.valores["linea"]) === "Demo";
    const conVenta = new Set<string>();
    for (const f of ctx.ventas) if (f.aceptada && !esDemo(f)) conVenta.add(folioDe(f.valores));
    const out: Hallazgo[] = [];
    for (const f of ctx.ventas) {
      const folio = folioDe(f.valores);
      if (!f.aceptada || !esDemo(f) || !conVenta.has(folio)) continue;
      out.push(
        hallazgo(
          "advertencia",
          "ventas",
          `Partida Demo dentro del folio ${folio}, que tambien trae ventas: la Demo se excluye, y los pagos ` +
            `del folio se aplican solo a las partidas que cuentan.`,
          {
            fila: f.fila,
            campo: "linea",
            accion: `Si la unidad demostrativa no es parte de esa venta, dele su propio folio.`,
          },
        ),
      );
    }
    return out;
  },
};

/** Umbral de CLAUDE.md: margen identico en mas del 80% de las filas. */
const UMBRAL_MARGEN_UNIFORME = 0.8;
const DECIMALES_MARGEN = 6;

const margenUniforme: Regla = {
  id: "margen-uniforme",
  severidad: "advertencia",
  descripcion: "Un margen identico en casi todas las filas sugiere costo derivado del precio.",
  evaluar(ctx) {
    const margenes: string[] = [];
    for (const f of ctx.ventas) {
      const costo = parseMonto(f.valores["costo_unitario"] ?? null);
      const pv = parseMonto(f.valores["precio_venta"] ?? null);
      if (costo === null || pv === null || pv === 0) continue;
      margenes.push(((pv - costo) / pv).toFixed(DECIMALES_MARGEN));
    }
    if (margenes.length === 0) return [];

    const conteo = new Map<string, number>();
    for (const m of margenes) conteo.set(m, (conteo.get(m) ?? 0) + 1);

    let dominante = "";
    let veces = 0;
    for (const [m, n] of conteo) if (n > veces) [dominante, veces] = [m, n];

    const proporcion = veces / margenes.length;
    if (proporcion <= UMBRAL_MARGEN_UNIFORME) return [];

    const pct = (proporcion * 100).toFixed(0);
    const margenPct = (Number(dominante) * 100).toFixed(1);
    return [
      hallazgo(
        "advertencia",
        "ventas",
        `El margen es exactamente ${margenPct}% en el ${pct}% de las ventas (${veces} de ${margenes.length}): el costo parece derivado del precio.`,
        {
          campo: "costo_unitario",
          accion: `Verifique que costo_unitario sea el costo real de cada equipo y no un porcentaje aplicado al precio.`,
        },
      ),
    ];
  },
};

// --------------------------- Reglas de INFO ---------------------------

/**
 * Las filas vacias se descartan en silencio, pero el conteo se informa. Se
 * agrega en un solo hallazgo por hoja: la plantilla trae cientos de filas de
 * relleno y una linea por cada una seria ruido, no informacion.
 */
const filasVacias: Regla = {
  id: "filas-vacias",
  severidad: "info",
  descripcion: "Filas en blanco del formato que se ignoraron.",
  evaluar(ctx) {
    const out: Hallazgo[] = [];
    for (const hoja of HOJAS_TABULARES) {
      const n = ctx.raw[hoja].filasVacias;
      if (n === 0) continue;
      out.push(hallazgo("info", hoja, `Se ignoraron ${n} filas vacias del formato.`));
    }
    return out;
  },
};

const filasEjemplo: Regla = {
  id: "filas-ejemplo",
  severidad: "info",
  descripcion: "Fila de ejemplo de la plantilla (V-000 / P-000 / G-000) descartada.",
  evaluar(ctx) {
    const out: Hallazgo[] = [];
    for (const hoja of HOJAS_TABULARES) {
      const n = ctx.raw[hoja].filasEjemplo;
      if (n === 0) continue;
      out.push(
        hallazgo("info", hoja, `Se descarto ${n} fila de ejemplo de la plantilla.`),
      );
    }
    return out;
  },
};

const filasNota: Regla = {
  id: "filas-nota",
  severidad: "info",
  descripcion: "Filas sin folio ni importe: son notas dejadas en la hoja, no registros.",
  evaluar(ctx) {
    const out: Hallazgo[] = [];
    for (const hoja of HOJAS_TABULARES) {
      for (const fila of ctx.raw[hoja].filasNota) {
        out.push(
          hallazgo("info", hoja, `Se ignoro la fila: no tiene folio ni importe, parece una nota y no un registro.`, {
            fila,
            accion: `Si es un registro, capture su folio y su importe; si es una nota, puede dejarla o borrarla.`,
          }),
        );
      }
    }
    return out;
  },
};

const filasDemo: Regla = {
  id: "filas-demo",
  severidad: "info",
  descripcion: "Filas con linea = Demo: se listan aparte y no cuentan como venta.",
  evaluar(ctx) {
    const out: Hallazgo[] = [];
    for (const f of ctx.ventas) {
      // La misma canonizacion que VentaSchema: lo que este panel anuncia como
      // excluido tiene que ser exactamente lo que el motor excluye.
      if (canonizar(LINEA, f.valores["linea"]) !== "Demo") continue;
      out.push(
        hallazgo("info", "ventas", `Venta marcada como Demo: se excluye del analisis de venta.`, {
          fila: f.fila,
          campo: "linea",
        }),
      );
    }
    return out;
  },
};

/** Que modulos quedan deshabilitados por falta de una hoja, y que capturar. */
const HOJA_HABILITA: Readonly<Record<NombreHoja, string>> = {
  ventas: "todos los modulos",
  cobranza: "los modulos de cobranza y flujo",
  gastos: "el estado de resultados",
};

const hojaAusente: Regla = {
  id: "hoja-ausente",
  severidad: "info",
  descripcion: "Una hoja no venia en el archivo: sus modulos se deshabilitan, no truenan.",
  evaluar(ctx) {
    const out: Hallazgo[] = [];
    for (const hoja of HOJAS_TABULARES) {
      if (ctx.raw[hoja].presente) continue;
      out.push(
        hallazgo("info", hoja, `El archivo no trae la hoja ${hoja}: se deshabilita ${HOJA_HABILITA[hoja]}.`, {
          accion: `Agregue la hoja ${hoja} a la plantilla y vuelva a cargar el archivo.`,
        }),
      );
    }
    if (!ctx.raw.parametros.presente) {
      out.push(
        hallazgo("info", "parametros", `El archivo no trae la hoja parametros: se usaran los valores por omision.`, {
          accion: `Agregue la hoja parametros para fijar IVA, provisiones y periodo.`,
        }),
      );
    }
    return out;
  },
};

// --------------------------- Valores de lista no reconocidos ---------------------------

/** Lo que recibe una columna de lista vacia, dicho para quien captura. */
function loQueSeAplica(campo: string, siVacia: string | null): string {
  if (siVacia !== null) return `se clasifico como "${siVacia}", igual que una celda vacia`;
  if (campo === "comision_base") {
    return "se aplica la base por omision de la hoja parametros (comision_base_default), igual que con la celda vacia";
  }
  if (campo === "tipo") return "se trata como gasto Fijo, igual que una celda vacia";
  return "se tomo como celda vacia";
}

/**
 * Un valor de una columna de lista que no es ninguna de sus opciones, ni
 * ignorando mayusculas, espacios y acentos. El esquema le da lo mismo que a la
 * celda vacia (ENUMERACIONES, en schema.ts); esta regla existe para que esa
 * sustitucion nunca sea silenciosa. Advertencia y no error: ver
 * docs/decisiones.md (2026-09-13).
 */
const enumeracionNoReconocida: Regla = {
  id: "enumeracion-no-reconocida",
  severidad: "advertencia",
  descripcion: "Valor de una columna de lista que no es ninguna de sus opciones: se toma como celda vacia.",
  evaluar(ctx) {
    const out: Hallazgo[] = [];
    for (const hoja of HOJAS_TABULARES) {
      for (const [campo, e] of Object.entries(ENUMERACIONES[hoja])) {
        const opciones: readonly string[] = e.opciones;
        for (const f of filasDe(ctx, hoja)) {
          // Lo capturado en ESTA fila: en `condicion` la cabecera del folio pudo sustituirlo.
          const crudo = f.capturados[campo];
          if (!f.aceptada || vacia(crudo) || canonizar(opciones, crudo) !== null) continue;
          out.push(
            hallazgo(
              "advertencia",
              hoja,
              `${campo} dice "${texto(crudo)}", que no es una opcion de la lista: ${loQueSeAplica(campo, e.siVacia)}.`,
              { fila: f.fila, campo, accion: `Escriba una de: ${opciones.join(", ")}.` },
            ),
          );
        }
      }
    }
    return out;
  },
};

// --------------------------- Hoja parametros ---------------------------
//
// La hoja parametros se valida como capa, igual que las de datos: ningun valor
// capturado se descarta sin un hallazgo que cite hoja y fila. Advertencia y no
// error, tambien cuando el parametro mueve cifras: ver docs/decisiones.md
// (2026-09-14).

/**
 * Un parametro capturado que no se puede leer. Antes caia en silencio a su valor
 * por omision: quien decidio provisionar al 30% veia un reporte al 25%. Se sigue
 * aplicando el valor por omision —el reporte se puede calcular—, y el panel dice
 * que se capturo, que se aplico y que formatos se aceptan. La lectura es la misma
 * que usa validate() (`LECTURAS`, en parametros.ts).
 */
const parametroNoReconocido: Regla = {
  id: "parametro-no-reconocido",
  severidad: "advertencia",
  descripcion: "Parametro capturado que no se puede leer: se aplica su valor por omision, y se dice.",
  evaluar(ctx) {
    // Las sustituciones las calcula validate() una sola vez: este aviso y los de
    // la interfaz salen de la misma lista y no pueden decir cosas distintas.
    return ctx.sustituciones.map((s) =>
      hallazgo(
        "advertencia",
        "parametros",
        `${s.clave} dice "${s.capturado}", que no se pudo leer: se aplica ${s.aplicado}.`,
        {
          ...(s.fila === null ? {} : { fila: s.fila }),
          campo: s.clave,
          accion: `Escriba ${LECTURAS[s.clave].formatos}.`,
        },
      ),
    );
  },
};

/** Una fila con un nombre que no es parametro del contrato: su valor nunca se aplica. */
const parametroDesconocido: Regla = {
  id: "parametro-desconocido",
  severidad: "advertencia",
  descripcion: "Fila de parametros con un nombre que no es del contrato: su valor no se aplica.",
  evaluar(ctx) {
    const p = ctx.raw.parametros;
    if (!p.presente) return [];
    const conocidas = new Set<string>(CLAVES_PARAMETROS);
    const out: Hallazgo[] = [];
    for (const [clave, crudo] of Object.entries(p.valores)) {
      if (conocidas.has(clave) || sinCapturar(crudo)) continue;
      const fila = p.filaDe[clave];
      out.push(
        hallazgo("advertencia", "parametros", `${clave} no es un parametro del contrato: su valor "${texto(crudo)}" no se aplica.`, {
          ...(fila === undefined ? {} : { fila }),
          campo: clave,
          accion: `Revise el nombre. Los parametros son: ${CLAVES_PARAMETROS.join(", ")}.`,
        }),
      );
    }
    return out;
  },
};

/** Un parametro en mas de una fila: gana la ultima, y las demas se pierden si nadie lo dice. */
const parametroRepetido: Regla = {
  id: "parametro-repetido",
  severidad: "advertencia",
  descripcion: "Parametro escrito en mas de una fila: se aplica la ultima.",
  evaluar(ctx) {
    const p = ctx.raw.parametros;
    if (!p.presente) return [];
    return Object.entries(p.filasRepetidas).map(([clave, filas]) => {
      const ultima = filas.at(-1);
      return hallazgo(
        "advertencia",
        "parametros",
        `${clave} aparece en las filas ${filas.join(", ")}: se aplica la fila ${ultima ?? "?"} y las demas no.`,
        { ...(ultima === undefined ? {} : { fila: ultima }), campo: clave, accion: "Deje una sola fila por parametro." },
      );
    });
  },
};

/** Un valor escrito en una fila sin nombre de parametro: no hay a que aplicarlo. */
const valorSinParametro: Regla = {
  id: "valor-sin-parametro",
  severidad: "advertencia",
  descripcion: "Fila de parametros con valor pero sin nombre: el valor no se aplica.",
  evaluar(ctx) {
    const p = ctx.raw.parametros;
    if (!p.presente) return [];
    return p.filasSinClave.map((fila) =>
      hallazgo("advertencia", "parametros", `La fila ${fila} trae un valor sin nombre de parametro: no se aplica.`, {
        fila,
        accion: "Escriba el nombre del parametro en la columna parametro, o borre el valor.",
      }),
    );
  },
};

/** Orden de evaluacion: errores primero, luego advertencias, luego info. */
export const REGLAS: readonly Regla[] = [
  valorNoNumerico,
  fechaInvalida,
  clienteEnConflicto,
  folioIncompleto,
  cobranzaHuerfana,
  filaRechazada,
  filaSinFecha,
  ventaSinDiasCredito,
  diasCreditoIlegible,
  porcentajeIlegible,
  abonoExcedePrecio,
  cabeceraEnConflicto,
  demoEnFolio,
  margenUniforme,
  enumeracionNoReconocida,
  parametroNoReconocido,
  parametroDesconocido,
  parametroRepetido,
  valorSinParametro,
  hojaAusente,
  filasEjemplo,
  filasVacias,
  filasNota,
  filasDemo,
];
