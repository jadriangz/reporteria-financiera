import type { TemaResuelto } from "./index";

/**
 * Contraste WCAG 2.1 sobre los tokens de `src/index.css`.
 *
 * Existe porque "se ve bien" no es un criterio verificable y en un reporte
 * financiero el color ES información: si la alarma no se lee como alarma, el
 * reporte miente. Aquí se calcula el ratio real de cada par texto/fondo que la
 * interfaz usa de verdad, y la prueba falla si alguno baja del umbral.
 *
 * Nada de este archivo llega al bundle: solo lo importa la prueba.
 *
 * Fórmulas de la especificación (WCAG 2.1, 1.4.3 y 1.4.11):
 *   - luminancia relativa L = 0.2126·R + 0.7152·G + 0.0722·B sobre canales
 *     linealizados
 *   - contraste = (L_claro + 0.05) / (L_oscuro + 0.05)
 */

/** Umbrales de la norma. */
export const UMBRAL = {
  /** 1.4.3 AA, texto normal. */
  texto: 4.5,
  /** 1.4.3 AA, texto grande (≥18.66px negrita o ≥24px). */
  textoGrande: 3,
  /** 1.4.11 AA, objetos gráficos que hacen falta para entender el contenido. */
  grafico: 3,
} as const;

export type Umbral = keyof typeof UMBRAL;

/** "#1F3864" a sus tres canales en 0-1. Lanza si no es un hexadecimal de 6. */
export function canales(hexadecimal: string): [number, number, number] {
  const limpio = hexadecimal.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(limpio)) {
    throw new Error(`No es un color hexadecimal de 6 dígitos: "${hexadecimal}"`);
  }
  const leer = (i: number): number => parseInt(limpio.slice(i, i + 2), 16) / 255;
  return [leer(0), leer(2), leer(4)];
}

/** Canal sRGB a lineal, como define la norma. */
function lineal(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminancia(hexadecimal: string): number {
  const [r, g, b] = canales(hexadecimal).map(lineal) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste entre dos colores. Simétrico: el orden no importa. */
export function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Redondeo a dos decimales, para reportar sin arrastrar ruido. */
export function redondearRatio(valor: number): number {
  return Math.round(valor * 100) / 100;
}

// --------------------------- Pares que se verifican ---------------------------

export interface ParContraste {
  /** Qué combinación de la interfaz representa. */
  readonly descripcion: string;
  /** Token del color de frente (texto o marca gráfica). */
  readonly frente: string;
  /** Token del color de fondo. */
  readonly fondo: string;
  readonly umbral: Umbral;
}

/**
 * Los pares que la interfaz usa de verdad.
 *
 * No es una matriz de todos contra todos: es la lista de combinaciones que
 * existen en los componentes. Una matriz completa obligaría a cumplir pares que
 * nadie pinta y empujaría la paleta a grises indistinguibles.
 *
 * Lo que NO está aquí, y por qué:
 *
 * - Bordes de panel, separadores y rejilla de las gráficas (slate-200/300).
 *   La 1.4.11 cubre los objetos gráficos NECESARIOS para entender el contenido;
 *   la rejilla no lo es —cada eje va rotulado y el tooltip da la cifra exacta—
 *   y un borde estructural tampoco. Exigirles 3:1 obligaría a bordes casi
 *   negros que en un reporte sobrio se leen como tachones.
 * - `slate-400` como texto: solo se usa en marcas decorativas (`aria-hidden`:
 *   las flechas de desplegar, los separadores «·») y en controles
 *   deshabilitados, que la 1.4.3 exceptúa explícitamente. Todo texto tenue con
 *   significado —ceros, meses sin actividad— usa `slate-500`, que sí se verifica.
 */
export const PARES: readonly ParContraste[] = [
  // Cuerpo del reporte.
  { descripcion: "Texto de cuerpo sobre la página", frente: "tinta", fondo: "papel", umbral: "texto" },
  { descripcion: "Texto de cuerpo sobre tarjeta", frente: "tinta", fondo: "superficie", umbral: "texto" },
  { descripcion: "Cifra fuerte de tabla sobre tarjeta", frente: "slate-900", fondo: "superficie", umbral: "texto" },
  { descripcion: "Cifra fuerte de tabla sobre la página", frente: "slate-900", fondo: "papel", umbral: "texto" },
  { descripcion: "Mensaje de validación sobre panel", frente: "slate-800", fondo: "slate-50", umbral: "texto" },
  { descripcion: "Cuerpo de un hallazgo sobre tarjeta", frente: "slate-700", fondo: "superficie", umbral: "texto" },
  { descripcion: "Texto secundario sobre la página", frente: "slate-600", fondo: "papel", umbral: "texto" },
  { descripcion: "Texto secundario sobre panel", frente: "slate-600", fondo: "slate-50", umbral: "texto" },
  { descripcion: "Nota de apoyo sobre la página", frente: "slate-500", fondo: "papel", umbral: "texto" },
  { descripcion: "Nota de apoyo sobre panel", frente: "slate-500", fondo: "slate-50", umbral: "texto" },
  { descripcion: "Cifra tenue (ceros, meses vacíos) sobre la página", frente: "slate-500", fondo: "superficie", umbral: "texto" },

  // Azul institucional: títulos, pestaña activa, enlaces.
  { descripcion: "Título institucional sobre la página", frente: "marino", fondo: "papel", umbral: "texto" },
  { descripcion: "Título institucional sobre panel", frente: "marino", fondo: "slate-50", umbral: "texto" },
  { descripcion: "Enlace sobre tarjeta", frente: "marino", fondo: "superficie", umbral: "texto" },

  // Tonos semánticos como TEXTO: es donde el color es información.
  { descripcion: "Cifra en riesgo sobre la página", frente: "riesgo", fondo: "papel", umbral: "texto" },
  { descripcion: "Cifra en riesgo sobre tarjeta", frente: "riesgo", fondo: "superficie", umbral: "texto" },
  { descripcion: "Título de alerta sobre su aviso", frente: "riesgo", fondo: "red-50", umbral: "texto" },
  { descripcion: "Cifra en advertencia sobre la página", frente: "advertencia", fondo: "papel", umbral: "texto" },
  { descripcion: "Cifra en advertencia sobre tarjeta", frente: "advertencia", fondo: "superficie", umbral: "texto" },
  { descripcion: "Título de advertencia sobre su aviso", frente: "advertencia", fondo: "amber-50", umbral: "texto" },
  { descripcion: "Cifra positiva sobre la página", frente: "positivo", fondo: "papel", umbral: "texto" },
  { descripcion: "Cifra positiva sobre tarjeta", frente: "positivo", fondo: "superficie", umbral: "texto" },
  { descripcion: "Título de oportunidad sobre su aviso", frente: "positivo", fondo: "emerald-50", umbral: "texto" },

  // Texto ENCIMA de un fondo de color sólido: botón primario, marcas, etiquetas.
  { descripcion: "Botón primario y etiqueta «A mano»", frente: "sobre-color", fondo: "marino", umbral: "texto" },
  { descripcion: "Marca de alerta del aviso", frente: "sobre-color", fondo: "riesgo", umbral: "texto" },
  { descripcion: "Marca de advertencia del aviso", frente: "sobre-color", fondo: "advertencia", umbral: "texto" },
  { descripcion: "Marca de oportunidad del aviso", frente: "sobre-color", fondo: "positivo", umbral: "texto" },

  // Series de las gráficas y segmentos de la barra de antigüedad: objetos
  // gráficos que SÍ hacen falta para leer el reporte.
  { descripcion: "Serie azul de la gráfica", frente: "marino", fondo: "papel", umbral: "grafico" },
  { descripcion: "Serie verde de la gráfica", frente: "positivo", fondo: "papel", umbral: "grafico" },
  { descripcion: "Serie roja de la gráfica", frente: "riesgo", fondo: "papel", umbral: "grafico" },
  { descripcion: "Serie ámbar de la gráfica", frente: "advertencia", fondo: "papel", umbral: "grafico" },
  { descripcion: "Serie tenue de la gráfica", frente: "slate-500", fondo: "papel", umbral: "grafico" },
];

export interface ResultadoContraste extends ParContraste {
  readonly tema: TemaResuelto;
  readonly hexFrente: string;
  readonly hexFondo: string;
  readonly ratio: number;
  readonly minimo: number;
  readonly cumple: boolean;
}

/** Evalúa todos los pares contra la tabla de tokens de un tema. */
export function evaluarPares(
  tema: TemaResuelto,
  tokens: Readonly<Record<string, string>>,
): ResultadoContraste[] {
  return PARES.map((par) => {
    const hexFrente = tokens[par.frente];
    const hexFondo = tokens[par.fondo];
    if (hexFrente === undefined || hexFondo === undefined) {
      throw new Error(
        `El tema "${tema}" no define ${hexFrente === undefined ? par.frente : par.fondo}`,
      );
    }
    const minimo = UMBRAL[par.umbral];
    const ratio = redondearRatio(contraste(hexFrente, hexFondo));
    return {
      descripcion: par.descripcion,
      frente: par.frente,
      fondo: par.fondo,
      umbral: par.umbral,
      tema,
      hexFrente,
      hexFondo,
      ratio,
      minimo,
      cumple: ratio >= minimo,
    };
  });
}

// --------------------------- Lectura de index.css ---------------------------

/**
 * Extrae los `--color-*: #hex` de un bloque de `index.css`, identificado por su
 * selector (los espacios del sangrado no importan).
 *
 * Se lee el CSS de verdad en vez de tener los hexadecimales también en
 * TypeScript: con dos copias, la prueba verificaría la copia y no lo que se
 * pinta. `index.css` sigue siendo la única fuente.
 */
export function tokensDeBloque(css: string, selector: string): Record<string, string> {
  const cuerpo = cuerpoDeRegla(css, selector);
  if (cuerpo === null) throw new Error(`No se encontró el bloque "${selector}" en index.css`);

  const tokens: Record<string, string> = {};
  for (const linea of cuerpo.split("\n")) {
    const m = /^\s*--color-([a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/.exec(linea);
    if (m !== null && m[1] !== undefined && m[2] !== undefined) tokens[m[1]] = m[2].toUpperCase();
  }
  if (Object.keys(tokens).length === 0) {
    throw new Error(`El bloque "${selector}" no declara ningún --color-*`);
  }
  return tokens;
}

/** Espacios colapsados, para comparar selectores sin depender del sangrado. */
function normalizar(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

/** Una regla de `index.css`, con los bloques que la contienen. */
export interface ReglaCss {
  /** Selector con los espacios colapsados: `:root, [data-tema]`, `@media screen`. */
  readonly selector: string;
  /** Selectores de los bloques que la envuelven, del más externo al más interno. */
  readonly envolturas: readonly string[];
  readonly cuerpo: string;
}

/**
 * Todas las reglas del archivo, incluidas las anidadas en `@media`, en el orden
 * en que se cierran. Recorre llevando la cuenta de llaves en vez de usar una
 * expresión regular: los bloques anidados de `@media` la romperían, y un
 * comentario que mencione un selector —este archivo tiene varios— haría que una
 * búsqueda por texto encontrara la prosa en lugar de la regla.
 *
 * Saber qué bloque envuelve a cada regla es lo que permite probar que el tema
 * oscuro solo existe en pantalla, en vez de confiar en que la impresión le gane.
 */
export function reglasDeCss(css: string): ReglaCss[] {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const reglas: ReglaCss[] = [];
  const pila: { selector: string; inicio: number }[] = [];
  let inicioSelector = 0;

  for (let i = 0; i < limpio.length; i += 1) {
    const c = limpio[i];
    if (c === "{") {
      pila.push({ selector: normalizar(limpio.slice(inicioSelector, i)), inicio: i + 1 });
      inicioSelector = i + 1;
    } else if (c === "}") {
      const abierto = pila.pop();
      if (abierto !== undefined) {
        reglas.push({
          selector: abierto.selector,
          envolturas: pila.map((p) => p.selector),
          cuerpo: limpio.slice(abierto.inicio, i),
        });
      }
      inicioSelector = i + 1;
    } else if (c === ";" && pila.length === 0) {
      inicioSelector = i + 1;
    }
  }
  return reglas;
}

/** Cuerpo de la primera regla que cierra con ese selector, también dentro de `@media`. */
function cuerpoDeRegla(css: string, selector: string): string | null {
  const buscado = normalizar(selector);
  return reglasDeCss(css).find((r) => r.selector === buscado)?.cuerpo ?? null;
}

/** Los tokens de cada tema tal como los declara `index.css`. */
export function tokensDeTema(css: string): Readonly<Record<TemaResuelto, Record<string, string>>> {
  // El bloque claro es completo por sí mismo; el oscuro también.
  return {
    claro: tokensDeBloque(css, '[data-tema="claro"]'),
    oscuro: tokensDeBloque(css, 'html[data-tema="oscuro"]'),
  };
}
