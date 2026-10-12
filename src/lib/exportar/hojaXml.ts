/**
 * Escritura de datos sobre el XML de una hoja de la plantilla.
 *
 * La exportacion no arma un libro: rellena la plantilla v2. Aqui esta lo unico
 * que se le hace a su XML, que es poner un valor dentro de una celda que ya
 * existe. El estilo de la celda (`s`), sus formulas, las listas desplegables,
 * los paneles fijos y los anchos no se escriben en ningun lado: se quedan como
 * vienen. Por eso no hay tabla de estilos que sincronizar con la plantilla.
 *
 * No es un parser de XML. Lee la forma exacta que tienen las hojas de la
 * plantilla —una fila por numero, todas sus celdas presentes, en orden— y, si
 * no la encuentra, lanza en vez de escribir a medias: una prueba exporta contra
 * la plantilla real, asi que una edicion que rompa esa forma pone la suite en
 * rojo antes de llegar al cliente.
 *
 * Funciones puras sobre texto.
 */

/** Lo que cabe en una celda: texto, numero o nada. */
export type Valor = string | number | null;

/**
 * La celda conserva la formula que trae la plantilla, con este valor guardado:
 * es lo que la formula muestra, para quien lea el archivo sin calcularlo.
 */
export interface Copiada {
  readonly copiada: Valor;
}

/** `undefined`: la celda no se toca (las columnas calculadas). */
export type Celda = Valor | Copiada | undefined;

const FILA = /<row\b[^>]*>[\s\S]*?<\/row>/g;
const CELDA = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const FORMULA = /<f\b[^>]*>[\s\S]*?<\/f>|<f\b[^>]*\/>/;
/** Un numero de fila dentro de una referencia relativa: `D300`, `$A301`. Nunca `$A$3`. */
const FILA_EN_REFERENCIA = /(?<=[A-Z])\d+(?!\d)/g;

export class PlantillaInesperada extends Error {
  constructor(detalle: string) {
    super(`La plantilla de exportación no tiene la forma esperada: ${detalle}.`);
    this.name = "PlantillaInesperada";
  }
}

/** Letra de columna a partir de su indice: 0 -> A, 17 -> R, 26 -> AA. */
export function letraDeColumna(indice: number): string {
  let n = indice;
  let letra = "";
  do {
    letra = String.fromCharCode(65 + (n % 26)) + letra;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letra;
}

/**
 * Texto de una celda. Ademas de las entidades de XML, lo que XML 1.0 no admite
 * (caracteres de control) va con el escape `_xHHHH_` de OOXML, y un texto que ya
 * parezca uno de esos escapes se protege para que vuelva tal cual.
 */
export function escaparTexto(texto: string): string {
  return texto
    .replace(/_(?=x[\da-fA-F]{4}_)/g, "_x005F_")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\p{Cc}/gu, (c) => {
      const codigo = c.charCodeAt(0);
      if (c === "\t" || c === "\n" || codigo >= 0x20) return c;
      return `_x${codigo.toString(16).toUpperCase().padStart(4, "0")}_`;
    });
}

const esCopiada = (c: Valor | Copiada): c is Copiada => typeof c === "object" && c !== null;

function celdaXml(ref: string, atributos: string, cuerpo: string | undefined, celda: Valor | Copiada): string {
  // Solo se conserva el estilo: el tipo (`t`) depende de lo que se escribe.
  const estilo = / s="\d+"/.exec(atributos)?.[0] ?? "";
  const abre = `<c r="${ref}"${estilo}`;
  const formula = esCopiada(celda) ? (FORMULA.exec(cuerpo ?? "")?.[0] ?? "") : "";
  const valor = esCopiada(celda) ? celda.copiada : celda;

  if (formula !== "") {
    if (typeof valor === "number") return `${abre}>${formula}<v>${valor}</v></c>`;
    return `${abre} t="str">${formula}<v>${escaparTexto(valor ?? "")}</v></c>`;
  }
  if (valor === null) return `${abre}/>`;
  if (typeof valor === "number") return `${abre}><v>${valor}</v></c>`;
  return `${abre} t="inlineStr"><is><t xml:space="preserve">${escaparTexto(valor)}</t></is></c>`;
}

/** Pone en una fila las celdas indicadas, por posicion de columna. Las `undefined` no se tocan. */
function llenarFila(fila: string, numero: number, celdas: readonly Celda[]): string {
  const pendientes = new Map<string, Valor | Copiada>();
  celdas.forEach((celda, c) => {
    if (celda !== undefined) pendientes.set(letraDeColumna(c), celda);
  });
  const llena = fila.replace(CELDA, (original: string, columna: string, n: string, atributos: string, cuerpo?: string) => {
    const celda = pendientes.get(columna);
    if (celda === undefined || Number(n) !== numero) return original;
    pendientes.delete(columna);
    return celdaXml(`${columna}${n}`, atributos, cuerpo, celda);
  });
  if (pendientes.size > 0) {
    throw new PlantillaInesperada(`la fila ${numero} no trae la celda ${[...pendientes.keys()].join(", ")}`);
  }
  return llena;
}

/** La misma fila de captura, con otro numero: sus referencias relativas se recorren con ella. */
function renumerar(fila: string, de: number, a: number): string {
  return fila
    .replace(`<row r="${de}"`, `<row r="${a}"`)
    .replace(FILA_EN_REFERENCIA, (n) => {
      if (Number(n) === de) return String(a);
      if (Number(n) === de - 1) return String(a - 1);
      return n;
    });
}

export interface HojaLlena {
  readonly xml: string;
  /** Ultima fila de la hoja, ya con los datos: la de la plantilla, o mas si no cupieron. */
  readonly ultimaFila: number;
}

/**
 * Escribe `filas` desde `primeraFila`, una por fila de captura de la plantilla.
 *
 * Si los datos no caben en las filas que la plantilla trae, se agregan filas
 * iguales a la ultima —mismos estilos, mismas formulas— y se extienden hasta
 * ahi el rango declarado de la hoja y sus listas desplegables.
 */
export function llenarHoja(xml: string, filas: readonly (readonly Celda[])[], primeraFila: number): HojaLlena {
  const inicio = xml.indexOf("<sheetData>");
  const fin = xml.indexOf("</sheetData>");
  if (inicio === -1 || fin === -1) throw new PlantillaInesperada("una hoja no tiene <sheetData>");

  const existentes = xml.slice(inicio, fin).match(FILA) ?? [];
  existentes.forEach((fila, i) => {
    if (!fila.startsWith(`<row r="${i + 1}"`)) throw new PlantillaInesperada(`la fila ${i + 1} no esta en su lugar`);
  });
  const ultimaDePlantilla = existentes.length;
  const molde = existentes[ultimaDePlantilla - 1];
  if (molde === undefined || ultimaDePlantilla < primeraFila) {
    throw new PlantillaInesperada("una hoja no tiene filas de captura");
  }

  const ultimaFila = Math.max(ultimaDePlantilla, primeraFila + filas.length - 1);
  const salida = existentes.slice(0, primeraFila - 1);
  for (let numero = primeraFila; numero <= ultimaFila; numero++) {
    const base = existentes[numero - 1] ?? renumerar(molde, ultimaDePlantilla, numero);
    const celdas = filas[numero - primeraFila];
    salida.push(celdas === undefined ? base : llenarFila(base, numero, celdas));
  }

  let resto = xml.slice(fin);
  let cabeza = xml.slice(0, inicio);
  if (ultimaFila > ultimaDePlantilla) {
    const hasta = new RegExp(`(?<=[A-Z])${ultimaDePlantilla}(?=")`, "g");
    cabeza = cabeza.replace(/<dimension ref="[^"]*"/, (d) => d.replace(hasta, String(ultimaFila)));
    resto = resto.replace(/ sqref="[^"]*"/g, (s) => s.replace(hasta, String(ultimaFila)));
  }
  return { xml: `${cabeza}<sheetData>${salida.join("")}${resto}`, ultimaFila };
}

/** Cambia las celdas indicadas de UNA fila que ya existe, sin mover nada mas. */
export function llenarFilaDeHoja(xml: string, numero: number, celdas: readonly Celda[]): string {
  const fila = new RegExp(`<row r="${numero}"[^>]*>[\\s\\S]*?</row>`).exec(xml);
  if (fila === null) throw new PlantillaInesperada(`falta la fila ${numero}`);
  return xml.replace(fila[0], () => llenarFila(fila[0], numero, celdas));
}

/** El indice de estilo (`s`) de una celda, tal como lo trae la hoja. */
export function estiloDeCelda(xml: string, ref: string): string | null {
  return new RegExp(`<c r="${ref}"[^>]*? s="(\\d+)"`).exec(xml)?.[1] ?? null;
}

/** La misma celda con otro estilo. Para la celda que deja de estar pendiente. */
export function conEstilo(xml: string, ref: string, estilo: string): string {
  return xml.replace(new RegExp(`(<c r="${ref}"[^>]*? s=")\\d+"`), `$1${estilo}"`);
}

/**
 * Extiende hasta `fila` los rangos que las formulas de la plantilla cierran en
 * `limite` (`$B$3:$B$1000`). Sin esto, con mas filas que el rango, `cobrado` y
 * `saldo` sumarian de menos en la hoja sin que nada lo dijera.
 */
export function extenderRangos(xml: string, limite: number, fila: number): string {
  return fila <= limite ? xml : xml.replace(new RegExp(`\\$${limite}(?!\\d)`, "g"), `$${fila}`);
}
