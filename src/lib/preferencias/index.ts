/**
 * Preferencias de interfaz en `localStorage`. LA ÚNICA EXCEPCIÓN a la regla 1
 * de CLAUDE.md, y el único archivo del proyecto que puede tocar `localStorage`.
 *
 * ALCANCE DE LA EXCEPCIÓN, textual:
 *
 *   Se permite persistir PREFERENCIAS DE INTERFAZ —tema, y más adelante idioma
 *   y disposición—. NUNCA datos financieros, datasets, parámetros de cálculo ni
 *   nada derivado de un archivo cargado.
 *
 * La excepción no se sostiene con disciplina, se sostiene con el compilador:
 * `guardarPreferencia` solo acepta claves de `PREFERENCIAS` y valores de la
 * lista de esa clave. Guardar `"dataset"`, `"fechaCorte"` o cualquier cosa que
 * no esté aquí NO COMPILA. Para agregar una clave hay que tocar este archivo, y
 * quien lo haga se topa de frente con este comentario.
 *
 * Una prueba comprueba, además, que ningún otro archivo de `src/` mencione
 * `localStorage`: si alguien decide saltarse este módulo, la suite se pone en
 * rojo antes de que el atajo llegue a producción.
 */

/** Prefijo propio: no colisiona con nada más servido desde el mismo origen. */
const PREFIJO = "rf.";

interface Definicion {
  /** Valores admitidos. Cualquier otra cosa guardada se descarta al leer. */
  readonly valores: readonly string[];
  /** Qué vale la preferencia si no hay nada guardado o lo guardado es basura. */
  readonly porOmision: string;
}

/**
 * LISTA BLANCA. Una entrada por preferencia de interfaz, y nada más.
 *
 * Antes de agregar una clave: ¿esto es una preferencia de cómo se VE la
 * aplicación, o es un dato del negocio? Si es lo segundo, no va aquí, y no va
 * en `localStorage` en absoluto.
 */
export const PREFERENCIAS = {
  tema: {
    valores: ["claro", "oscuro", "sistema"],
    porOmision: "sistema",
  },
} as const satisfies Readonly<Record<string, Definicion>>;

export type NombrePreferencia = keyof typeof PREFERENCIAS;

/** Los valores admitidos de una preferencia, como union de literales. */
export type ValorPreferencia<N extends NombrePreferencia> =
  (typeof PREFERENCIAS)[N]["valores"][number];

/** La clave real en `localStorage`. Exportada para el script de `index.html`. */
export function claveDe(nombre: NombrePreferencia): string {
  return `${PREFIJO}${nombre}`;
}

/** ¿`valor` es uno de los admitidos para esta preferencia? */
function admitido<N extends NombrePreferencia>(
  nombre: N,
  valor: string | null,
): valor is ValorPreferencia<N> {
  const valores: readonly string[] = PREFERENCIAS[nombre].valores;
  return valor !== null && valores.includes(valor);
}

/**
 * Lee una preferencia. Nunca lanza y nunca devuelve algo fuera de la lista.
 *
 * `localStorage` puede no existir (SSR, pruebas en node) o lanzar en ventana
 * privada y con cookies bloqueadas. En cualquiera de esos casos la preferencia
 * vale su valor por omisión: no poder recordar el tema no es motivo para tumbar
 * un reporte financiero.
 */
export function leerPreferencia<N extends NombrePreferencia>(nombre: N): ValorPreferencia<N> {
  const porOmision = PREFERENCIAS[nombre].porOmision as ValorPreferencia<N>;
  try {
    if (typeof localStorage === "undefined") return porOmision;
    const guardado = localStorage.getItem(claveDe(nombre));
    return admitido(nombre, guardado) ? guardado : porOmision;
  } catch {
    return porOmision;
  }
}

/**
 * Guarda una preferencia. Nunca lanza: si el navegador no deja escribir, la
 * preferencia simplemente no sobrevive a la recarga.
 *
 * El tipo de `valor` depende de `nombre`, así que `guardarPreferencia("tema",
 * "azul")` tampoco compila.
 */
export function guardarPreferencia<N extends NombrePreferencia>(
  nombre: N,
  valor: ValorPreferencia<N>,
): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(claveDe(nombre), valor);
  } catch {
    /* Sin almacenamiento disponible: la preferencia vive solo en memoria. */
  }
}

/** Olvida una preferencia y vuelve al valor por omisión. */
export function olvidarPreferencia(nombre: NombrePreferencia): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(claveDe(nombre));
  } catch {
    /* Igual que al guardar: no poder olvidar no es un error del reporte. */
  }
}
