import type { NombreHoja, RawCelda } from "../parse/tipos";
import { CATEGORIA_GASTO, COMISION_BASE, CONDICION, LINEA, METODO_PAGO, TIPO_GASTO } from "../schema";

/**
 * Campos del formulario de captura, uno por columna del contrato.
 *
 * NO es un segundo esquema: no valida nada. Solo dice que control pintar para
 * cada campo de `VentaSchema`, `CobranzaSchema` y `GastoSchema`, y como
 * convertir lo escrito en una celda cruda. La validacion la hace el mismo
 * `validate()` que procesa el archivo. Una prueba exige que las claves de aqui
 * sean exactamente las de los esquemas: si el contrato cambia, esto no compila
 * en silencio con un campo de menos.
 */

export type TipoCampo = "texto" | "fecha" | "importe" | "porcentaje" | "entero" | "opcion";

export interface CampoCaptura {
  /** Nombre de la columna en el contrato y en la plantilla. */
  readonly clave: string;
  readonly etiqueta: string;
  readonly tipo: TipoCampo;
  /** Solo para `opcion`: las listas desplegables de la plantilla. */
  readonly opciones?: readonly string[];
  /** Pista visual; quien decide si falta es el esquema. */
  readonly obligatorio?: boolean;
  readonly ayuda?: string;
}

export const CAMPOS: Readonly<Record<NombreHoja, readonly CampoCaptura[]>> = {
  ventas: [
    { clave: "folio", etiqueta: "Folio", tipo: "texto", obligatorio: true, ayuda: "Único por venta, p. ej. V-022." },
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    // "Demo" se ofrece a proposito: una unidad demostrativa se captura igual y el motor la aparta.
    { clave: "linea", etiqueta: "Línea", tipo: "opcion", opciones: LINEA },
    { clave: "cliente", etiqueta: "Cliente", tipo: "texto", obligatorio: true },
    { clave: "modelo", etiqueta: "Modelo", tipo: "texto", obligatorio: true },
    { clave: "serie", etiqueta: "Serie", tipo: "texto" },
    { clave: "costo_unitario", etiqueta: "Costo unitario", tipo: "importe", ayuda: "Costo real de adquisición." },
    { clave: "precio_venta", etiqueta: "Precio de venta", tipo: "importe" },
    { clave: "comision_pct", etiqueta: "Comisión", tipo: "porcentaje", ayuda: "En porcentaje, p. ej. 5." },
    { clave: "comision_base", etiqueta: "Base de comisión", tipo: "opcion", opciones: COMISION_BASE },
    { clave: "dias_credito", etiqueta: "Días de crédito", tipo: "entero" },
    { clave: "condicion", etiqueta: "Condición", tipo: "opcion", opciones: CONDICION },
    { clave: "vendedor", etiqueta: "Vendedor", tipo: "texto" },
    { clave: "notas", etiqueta: "Notas", tipo: "texto" },
  ],
  cobranza: [
    { clave: "folio_pago", etiqueta: "Folio de pago", tipo: "texto", ayuda: "P. ej. P-019." },
    { clave: "folio_venta", etiqueta: "Folio de venta", tipo: "texto", obligatorio: true, ayuda: "La venta a la que se abona." },
    { clave: "fecha_pago", etiqueta: "Fecha de pago", tipo: "fecha", ayuda: "La fecha real en que entró el dinero." },
    { clave: "monto", etiqueta: "Monto", tipo: "importe" },
    { clave: "metodo", etiqueta: "Método", tipo: "opcion", opciones: METODO_PAGO },
    { clave: "cliente_ref", etiqueta: "Cliente (referencia)", tipo: "texto" },
    { clave: "notas", etiqueta: "Notas", tipo: "texto" },
  ],
  gastos: [
    { clave: "folio_gasto", etiqueta: "Folio", tipo: "texto", ayuda: "P. ej. G-006." },
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "categoria", etiqueta: "Categoría", tipo: "opcion", opciones: CATEGORIA_GASTO },
    { clave: "subcategoria", etiqueta: "Subcategoría", tipo: "texto" },
    { clave: "descripcion", etiqueta: "Descripción", tipo: "texto" },
    { clave: "monto", etiqueta: "Monto", tipo: "importe" },
    { clave: "tipo", etiqueta: "Tipo", tipo: "opcion", opciones: TIPO_GASTO },
    { clave: "proveedor", etiqueta: "Proveedor", tipo: "texto" },
    { clave: "notas", etiqueta: "Notas", tipo: "texto" },
  ],
};

/** Lo que el usuario escribio, campo por campo, tal cual. */
export type Entradas = Readonly<Record<string, string>>;

/** ¿El formulario sigue en blanco? Entonces no hay nada que validar todavia. */
export function enBlanco(entradas: Entradas): boolean {
  return Object.values(entradas).every((v) => v.trim() === "");
}

/**
 * Convierte lo escrito en una celda cruda, como si viniera de Excel.
 *
 * - Importe: se aceptan comas de miles y signo de pesos, al estilo mexicano
 *   ("$444,800.50"), y se entrega como NUMERO en pesos. Nunca como texto: el
 *   lector interpreta el texto en formato europeo y "444,800.50" saldria mal.
 * - Porcentaje: se entrega como "5%" para que no haya duda de que 5 es 5% y
 *   0.5 es medio punto.
 * - Fecha: el control nativo entrega aaaa-mm-dd; se convierte a Date en UTC.
 *
 * Lo que no se puede convertir se entrega TAL CUAL: el validador lo reporta con
 * el mismo mensaje que daria para una celda mala del archivo.
 */
export function aCelda(tipo: TipoCampo, valor: string): RawCelda {
  const v = valor.trim();
  if (v === "") return null;

  switch (tipo) {
    case "texto":
    case "opcion":
      return v;
    case "importe": {
      const n = Number(v.replace(/[$\s,]/g, ""));
      return Number.isFinite(n) ? n : v;
    }
    case "porcentaje": {
      const n = Number(v.replace(/[%\s]/g, "").replace(",", "."));
      return Number.isFinite(n) ? `${n}%` : v;
    }
    case "entero": {
      const n = Number(v);
      return Number.isInteger(n) ? n : v;
    }
    case "fecha": {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      if (m === null) return v;
      const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
      return Number.isNaN(d.getTime()) ? v : d;
    }
  }
}

/** Todas las celdas de una fila, en el formato que produce el lector. */
export function aCeldas(hoja: NombreHoja, entradas: Entradas): Record<string, RawCelda> {
  return Object.fromEntries(CAMPOS[hoja].map((c) => [c.clave, aCelda(c.tipo, entradas[c.clave] ?? "")]));
}

/** Formulario vacio de una hoja. */
export function entradasVacias(hoja: NombreHoja): Entradas {
  return Object.fromEntries(CAMPOS[hoja].map((c) => [c.clave, ""]));
}
