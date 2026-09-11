import {
  type Hallazgo,
  type Severidad,
  parseFecha,
  parseMonto,
  parsePct,
} from "../schema";

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
  readonly valores: Readonly<Record<string, RawCelda>>;
  /** null si Zod la rechazo: entonces no entra al Dataset. */
  readonly aceptada: boolean;
}

export interface ContextoValidacion {
  readonly raw: RawSheets;
  readonly ventas: readonly FilaEvaluada[];
  readonly cobranza: readonly FilaEvaluada[];
  readonly gastos: readonly FilaEvaluada[];
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
 * Un valor que el cliente SI escribio pero que no se pudo interpretar como
 * numero. Se distingue de la celda vacia comparando el crudo contra el
 * resultado de la coercion del contrato: si habia texto y salio null, es basura.
 */
const valorNoNumerico: Regla = {
  id: "valor-no-numerico",
  severidad: "error",
  descripcion: "Celda de importe o porcentaje con contenido no interpretable como numero.",
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
              accion: `Escriba solo cifras en ${campo}, por ejemplo 444800 o $ 444.800,00. Borre el texto si no aplica.`,
            }),
          );
        }
        for (const campo of COLUMNAS_PCT[hoja]) {
          const crudo = f.valores[campo] ?? null;
          if (vacia(crudo) || parsePct(crudo) !== null) continue;
          out.push(
            hallazgo("error", hoja, `El porcentaje "${texto(crudo)}" no es un numero valido.`, {
              fila: f.fila,
              campo,
              accion: `Escriba ${campo} como 5% o 0.05. Deje la celda vacia si no aplica.`,
            }),
          );
        }
      }
    }
    return out;
  },
};

/** Fecha escrita pero ilegible. La celda vacia es advertencia, no error. */
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
              accion: `Escriba ${campo} en formato dd/mm/aaaa, por ejemplo 31/01/2026.`,
            }),
          );
        }
      }
    }
    return out;
  },
};

const folioDuplicado: Regla = {
  id: "folio-duplicado",
  severidad: "error",
  descripcion: "Dos ventas comparten el mismo folio: la cobranza no sabria a cual aplicar.",
  evaluar(ctx) {
    const vistos = new Map<string, number>();
    const out: Hallazgo[] = [];
    for (const f of ctx.ventas) {
      const folio = texto(f.valores["folio"]);
      if (folio === "") continue;
      const previa = vistos.get(folio);
      if (previa === undefined) {
        vistos.set(folio, f.fila);
        continue;
      }
      out.push(
        hallazgo("error", "ventas", `El folio ${folio} ya se uso en la fila ${previa}.`, {
          fila: f.fila,
          campo: "folio",
          accion: `Asigne un folio unico a esta venta o elimine la fila repetida.`,
        }),
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
        if (f.aceptada) continue;
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

const abonoExcedePrecio: Regla = {
  id: "abono-excede-precio",
  severidad: "advertencia",
  descripcion: "Lo cobrado de una venta supera su precio: sobra dinero o falta capturar el precio.",
  evaluar(ctx) {
    const precio = new Map<string, number>();
    for (const f of ctx.ventas) {
      const folio = texto(f.valores["folio"]);
      const monto = parseMonto(f.valores["precio_venta"] ?? null);
      if (folio !== "" && monto !== null) precio.set(folio, monto);
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
      if (texto(f.valores["linea"]).toLowerCase() !== "demo") continue;
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

/** Orden de evaluacion: errores primero, luego advertencias, luego info. */
export const REGLAS: readonly Regla[] = [
  valorNoNumerico,
  fechaInvalida,
  folioDuplicado,
  cobranzaHuerfana,
  filaRechazada,
  filaSinFecha,
  ventaSinDiasCredito,
  abonoExcedePrecio,
  margenUniforme,
  hojaAusente,
  filasEjemplo,
  filasVacias,
  filasNota,
  filasDemo,
];
