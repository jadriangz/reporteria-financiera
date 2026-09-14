import { create } from "zustand";

import {
  type Cartera,
  type Clientes,
  type Flujo,
  type Insight,
  type Producto,
  type Resultados,
  calcularCartera,
  calcularClientes,
  calcularFlujo,
  calcularInsights,
  calcularProducto,
  calcularResultados,
  hoyUTC,
} from "../lib/calc";
import {
  type Capturas,
  type Entradas,
  SIN_CAPTURAS,
  combinar,
  hojasEnBlanco,
  nuevaCaptura,
  siguienteFila,
} from "../lib/captura";
import { libroDeDataset } from "../lib/exportar";
import { cargarSheetJS, readWorkbook, validate } from "../lib/parse";
import type { ParametroSustituido } from "../lib/parse/parametros";
import type { NombreHoja, RawSheets } from "../lib/parse/tipos";
import { type Capacidades, type Dataset, type Hallazgo, type Parametros, capacidades } from "../lib/schema";

/**
 * Estado global de la app.
 *
 * UNA SOLA REPRESENTACION, DOS PUERTAS DE ENTRADA. El estado base es el libro
 * crudo que se leyo del archivo (`raw`, o hojas en blanco si se empezo sin
 * archivo) mas las filas capturadas a mano (`capturas`), guardadas en el mismo
 * formato crudo. De ahi, y solo de ahi, se derivan juntos el dataset, los
 * hallazgos y los calculos, con el mismo `validate()` para las dos puertas.
 *
 * REGLA 1 DE CLAUDE.MD: nada de localStorage, sessionStorage ni IndexedDB. El
 * estado vive en memoria y muere al recargar. No es un descuido: el argumento de
 * venta es que los datos financieros del cliente no se guardan en ningun lado.
 *
 * El motor se recalcula cuando cambia el dataset O cualquier parametro ajustable,
 * y solo entonces: los cinco modulos se calculan una vez y se guardan, no en cada
 * render.
 */

/** Los seis modulos de reporte, mas su etiqueta y su requisito. */
export const MODULOS = [
  { id: "resumen", titulo: "Resumen ejecutivo", requiere: "resumen" },
  { id: "resultados", titulo: "Estado de resultados", requiere: "estadoResultados" },
  { id: "flujo", titulo: "Ventas y flujo", requiere: "flujo" },
  { id: "cobranza", titulo: "Cobranza", requiere: "cobranza" },
  { id: "producto", titulo: "Rendimiento por producto", requiere: "producto" },
  { id: "clientes", titulo: "Clientes", requiere: "clientes" },
] as const satisfies readonly {
  id: string;
  titulo: string;
  requiere: keyof Capacidades;
}[];

export type IdModulo = (typeof MODULOS)[number]["id"];

/** Que hoja hace falta para habilitar cada modulo, en palabras del usuario. */
export const MOTIVO_DESHABILITADO: Readonly<Record<keyof Capacidades, string>> = {
  resumen: "Requiere la hoja ventas",
  estadoResultados: "Requiere las hojas ventas y gastos",
  flujo: "Requiere la hoja cobranza con fecha_pago capturada",
  cobranza: "Requiere las hojas ventas y cobranza",
  producto: "Requiere la hoja ventas",
  clientes: "Requiere la hoja ventas",
};

/** Parametros que el usuario puede mover desde la barra superior. */
export interface ParametrosUsuario {
  readonly fechaCorte: Date;
  readonly provision91180: number;
  readonly provisionMas180: number;
  readonly comisionBaseDefault: string;
}

export type ClaveParametro = keyof ParametrosUsuario;

/**
 * El parametro del contrato que mueve cada control. La fecha de corte no esta en
 * la hoja parametros: moverla no resuelve ninguna sustitucion.
 */
const CLAVE_EN_CONTRATO: Readonly<Record<ClaveParametro, keyof Parametros | null>> = {
  fechaCorte: null,
  provision91180: "provision_91_180",
  provisionMas180: "provision_mas_180",
  comisionBaseDefault: "comision_base_default",
};

/** Todo lo que el motor produjo para el dataset y los parametros actuales. */
export interface Calculos {
  readonly resultados: Resultados;
  readonly cartera: Cartera;
  readonly producto: Producto;
  readonly clientes: Clientes;
  readonly flujo: Flujo;
  readonly insights: readonly Insight[];
  readonly capacidades: Capacidades;
}

export type EstadoCarga = "vacio" | "cargando" | "listo" | "error";

/** Que se ve en el area principal: los modulos del reporte o la captura manual. */
export type Pantalla = "reporte" | "captura";

/** Que se imprime: la vista abierta, o los seis modulos con portada. */
export type ModoImpresion = "actual" | "completo";

/**
 * Una peticion de imprimir. El `id` cambia en cada peticion para que la vista
 * imprimible se monte de nuevo aunque la anterior no se haya cerrado: si un
 * navegador no dispara `afterprint`, el siguiente clic igual imprime.
 */
export interface SolicitudImpresion {
  readonly modo: ModoImpresion;
  readonly id: number;
}

interface AppState {
  readonly estado: EstadoCarga;
  readonly nombreArchivo: string | null;
  readonly errorCarga: string | null;
  /** Lo que vino del archivo, sin validar. Hojas en blanco si no hubo archivo. */
  readonly raw: RawSheets | null;
  /** Filas capturadas a mano, por hoja. Viven solo en memoria. */
  readonly capturas: Capturas;
  /** El dataset validado de archivo + capturas: lo que consume el motor. */
  readonly dataset: Dataset | null;
  readonly hallazgos: readonly Hallazgo[];
  /** Parametros del archivo que no se pudieron leer, y lo que se aplico. Ver `sustitucionesVigentes`. */
  readonly sustituciones: readonly ParametroSustituido[];
  /**
   * Parametros del contrato que el usuario ya ajusto a mano desde la interfaz.
   * Sobreviven a volver a validar (capturar o borrar una fila) y se vacian al
   * cargar otro archivo, empezar de cero o limpiar.
   */
  readonly ajustados: readonly (keyof Parametros)[];
  readonly calculos: Calculos | null;
  readonly parametros: ParametrosUsuario;
  readonly moduloActivo: IdModulo;
  readonly impresion: SolicitudImpresion | null;
  readonly pantalla: Pantalla;

  cargarArchivo(file: File): Promise<void>;
  /** Empieza de cero, sin archivo, directo a la captura manual. */
  empezarSinArchivo(): void;
  /** Agrega una fila capturada, o reemplaza la de `id` si se esta editando. */
  guardarFila(hoja: NombreHoja, entradas: Entradas, id: string | null): void;
  /** Borra una fila capturada. Las del archivo no se borran: se corrige el Excel. */
  borrarFila(hoja: NombreHoja, id: string): void;
  irACaptura(): void;
  /** Descarga el dataset actual como .xlsx con la estructura de la plantilla. */
  exportarExcel(nombre: string): Promise<void>;
  limpiar(): void;
  actualizarParametro<K extends ClaveParametro>(clave: K, valor: ParametrosUsuario[K]): void;
  irAModulo(id: IdModulo): void;
  /** Monta la vista imprimible; la vista llama a window.print() cuando esta lista. */
  solicitarImpresion(modo: ModoImpresion): void;
  /** Desmonta la vista imprimible, al cerrar el dialogo de impresion. */
  terminarImpresion(): void;
}

/**
 * Las sustituciones que siguen vigentes: las del archivo, menos las de los
 * parametros que el usuario ya ajusto. Ajustar el control es decidir el valor:
 * desde ahi lo que se aplica ya no es un valor por omision que nadie eligio, y
 * el aviso sobra. No calcula nada: filtra lo que entrego `validate()`.
 */
export function sustitucionesVigentes(s: {
  readonly sustituciones: readonly ParametroSustituido[];
  readonly ajustados: readonly (keyof Parametros)[];
}): readonly ParametroSustituido[] {
  return s.sustituciones.filter((x) => !s.ajustados.includes(x.clave));
}

const PARAMETROS_INICIALES: ParametrosUsuario = {
  fechaCorte: hoyUTC(),
  provision91180: 0.25,
  provisionMas180: 0.5,
  comisionBaseDefault: "Venta",
};

/**
 * Aplica los parametros que el usuario movio encima de los que traia el archivo.
 * El dataset original no se muta: se devuelve una copia con `parametros` nuevos.
 */
function conParametrosDeUsuario(dataset: Dataset, p: ParametrosUsuario): Dataset {
  return {
    ...dataset,
    parametros: {
      ...dataset.parametros,
      provision_91_180: p.provision91180,
      provision_mas_180: p.provisionMas180,
      comision_base_default: p.comisionBaseDefault as Dataset["parametros"]["comision_base_default"],
    },
  };
}

/**
 * Corre el motor completo. Es el UNICO punto donde se calcula, y solo se llama
 * al cargar un archivo o al mover un parametro: nunca durante un render.
 */
function recalcular(dataset: Dataset, p: ParametrosUsuario): Calculos {
  const d = conParametrosDeUsuario(dataset, p);
  const opciones = { fechaCorte: p.fechaCorte };
  return {
    resultados: calcularResultados(d),
    cartera: calcularCartera(d, opciones),
    producto: calcularProducto(d),
    clientes: calcularClientes(d),
    flujo: calcularFlujo(d),
    insights: calcularInsights(d, opciones),
    capacidades: capacidades(d),
  };
}

/**
 * Deriva todo lo calculable del estado base. Es el UNICO lugar donde se valida,
 * y se llama al cargar, al capturar o borrar una fila, o al empezar de cero.
 */
function derivar(
  raw: RawSheets,
  capturas: Capturas,
  parametros: ParametrosUsuario,
): Pick<AppState, "dataset" | "hallazgos" | "sustituciones" | "calculos"> {
  const { dataset, hallazgos, sustituciones } = validate(combinar(raw, capturas));
  return { dataset, hallazgos, sustituciones, calculos: recalcular(dataset, parametros) };
}

/** Parametros ajustables a partir de lo que trae el archivo. */
function parametrosDe(dataset: Dataset, actuales: ParametrosUsuario): ParametrosUsuario {
  return {
    ...actuales,
    provision91180: dataset.parametros.provision_91_180,
    provisionMas180: dataset.parametros.provision_mas_180,
    comisionBaseDefault: dataset.parametros.comision_base_default,
  };
}

/** Identificador de captura. Solo tiene que ser unico durante la sesion. */
let consecutivo = 0;
const nuevoId = (): string => {
  consecutivo += 1;
  return `c${consecutivo}`;
};

const ESTADO_VACIO = {
  estado: "vacio",
  nombreArchivo: null,
  errorCarga: null,
  raw: null,
  capturas: SIN_CAPTURAS,
  dataset: null,
  hallazgos: [],
  sustituciones: [],
  ajustados: [],
  calculos: null,
  moduloActivo: "resumen",
  impresion: null,
  pantalla: "reporte",
} as const satisfies Partial<AppState>;

export const useAppStore = create<AppState>()((set, get) => ({
  ...ESTADO_VACIO,
  parametros: PARAMETROS_INICIALES,

  async cargarArchivo(file) {
    set({ estado: "cargando", nombreArchivo: file.name, errorCarga: null });

    try {
      const raw = await readWorkbook(file);

      // Los parametros del archivo son el punto de partida de los ajustables:
      // si el cliente capturo sus provisiones, se respetan.
      const parametros = parametrosDe(validate(raw).dataset, get().parametros);

      set({
        estado: "listo",
        raw,
        capturas: SIN_CAPTURAS,
        parametros,
        // Archivo nuevo, decisiones nuevas: ningun parametro esta ajustado todavia.
        ajustados: [],
        ...derivar(raw, SIN_CAPTURAS, parametros),
        moduloActivo: "resumen",
        pantalla: "reporte",
      });
    } catch (error) {
      // Solo llega aqui un archivo ilegible: los datos malos son hallazgos,
      // no excepciones. Ver la regla de degradacion elegante.
      set({
        estado: "error",
        errorCarga:
          error instanceof Error
            ? error.message
            : "No se pudo leer el archivo. Verifique que sea .xlsx o .csv.",
        raw: null,
        capturas: SIN_CAPTURAS,
        dataset: null,
        hallazgos: [],
        sustituciones: [],
        ajustados: [],
        calculos: null,
      });
    }
  },

  empezarSinArchivo() {
    const raw = hojasEnBlanco();
    const parametros = parametrosDe(validate(raw).dataset, PARAMETROS_INICIALES);
    set({
      ...ESTADO_VACIO,
      estado: "listo",
      raw,
      parametros,
      ...derivar(raw, SIN_CAPTURAS, parametros),
      pantalla: "captura",
    });
  },

  guardarFila(hoja, entradas, id) {
    const { raw, capturas, parametros } = get();
    if (raw === null) return;
    const existente = id === null ? undefined : capturas[hoja].find((c) => c.id === id);
    const fila = existente?.fila ?? siguienteFila(raw, capturas, hoja);
    const captura = nuevaCaptura(existente?.id ?? nuevoId(), fila, hoja, entradas);
    const nuevas: Capturas = {
      ...capturas,
      [hoja]:
        existente === undefined
          ? [...capturas[hoja], captura]
          : capturas[hoja].map((c) => (c.id === existente.id ? captura : c)),
    };
    set({ capturas: nuevas, ...derivar(raw, nuevas, parametros) });
  },

  borrarFila(hoja, id) {
    const { raw, capturas, parametros } = get();
    if (raw === null) return;
    const nuevas: Capturas = { ...capturas, [hoja]: capturas[hoja].filter((c) => c.id !== id) };
    set({ capturas: nuevas, ...derivar(raw, nuevas, parametros) });
  },

  irACaptura() {
    set({ pantalla: "captura" });
  },

  async exportarExcel(nombre) {
    const { dataset, parametros } = get();
    if (dataset === null) return;
    // Mismo chunk dinamico que la lectura: SheetJS no entra al bundle inicial.
    const xlsx = await cargarSheetJS();
    // Con los parametros que el usuario ajusto: el archivo reproduce el reporte.
    const libro = libroDeDataset(xlsx, conParametrosDeUsuario(dataset, parametros));
    xlsx.writeFile(libro, nombre, { compression: true });
  },

  limpiar() {
    set({ ...ESTADO_VACIO, parametros: PARAMETROS_INICIALES });
  },

  actualizarParametro(clave, valor) {
    const { dataset, parametros, ajustados } = get();
    const nuevos = { ...parametros, [clave]: valor };
    const contrato = CLAVE_EN_CONTRATO[clave];
    set({
      parametros: nuevos,
      // El usuario decidio este valor: su aviso de sustitucion deja de aplicar.
      ajustados: contrato === null || ajustados.includes(contrato) ? ajustados : [...ajustados, contrato],
      // Recalcula aqui, una sola vez, no en cada render de cada modulo.
      calculos: dataset === null ? null : recalcular(dataset, nuevos),
    });
  },

  irAModulo(id) {
    set({ moduloActivo: id, pantalla: "reporte" });
  },

  solicitarImpresion(modo) {
    set({ impresion: { modo, id: (get().impresion?.id ?? 0) + 1 } });
  },

  terminarImpresion() {
    set({ impresion: null });
  },
}));
