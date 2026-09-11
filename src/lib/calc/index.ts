export {
  type Centavos,
  type ClaveMes,
  type MotivoExclusion,
  type ParticionVentas,
  type VentaExcluida,
  LINEA_EXCLUIDA,
  SIN_FECHA,
  aCentavos,
  claveMes,
  compararClaveMes,
  diasEntre,
  divSegura,
  hoyUTC,
  mesesEntre,
  particionarVentas,
  suma,
  sumarDias,
  ventasComputables,
} from "./base";

export {
  type CalculoVenta,
  type OrigenBaseComision,
  calcularVenta,
  resolverBaseComision,
} from "./venta";

export {
  type Cascada,
  type CascadaMes,
  type DetalleComision,
  type Resultados,
  calcularResultados,
  puntoEquilibrio,
} from "./resultados";

export {
  type Aging,
  type BaseAntiguedad,
  type Bucket,
  type Cartera,
  type ClaveBucket,
  type OpcionesCartera,
  type SaldoVenta,
  BUCKETS,
  BUCKET_SIN_FECHA,
  CLAVES_BUCKET,
  bucketDe,
  calcularCartera,
  calcularDSO,
  calcularProvision,
  cobradoPorFolio,
  diasDelPeriodo,
  diasDeVenta,
} from "./cobranza";

export {
  type GrupoProducto,
  type LineaProducto,
  type Producto,
  calcularProducto,
} from "./producto";

export {
  type AttachRate,
  type Cliente,
  type Clientes,
  type Concentracion,
  LINEA_ACCESORIO,
  LINEA_EQUIPO,
  calcularClientes,
} from "./clientes";

export { type Flujo, type MesFlujo, calcularFlujo } from "./flujo";

export {
  type ContextoInsight,
  type Insight,
  type NivelInsight,
  type OpcionesInsights,
  type ReglaInsight,
  REGLAS_INSIGHT,
  UMBRAL_ATTACH,
  UMBRAL_CONCENTRACION_TOP5,
  calcularInsights,
  construirContexto,
} from "./insights";
