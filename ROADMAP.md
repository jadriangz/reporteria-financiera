# Roadmap del producto

Complementa `GOBERNANZA.md` (proceso) y `CLAUDE.md` (especificación técnica). Este
documento define **qué se construye, en qué orden y por qué**.

Se revisa al cerrar cada fase. Si una fase cambia de prioridad, se cambia aquí con la
razón, no de palabra.

---

## 1. Posicionamiento

**Qué es.** Capa de inteligencia de negocio y reportería financiera para PyMEs, operada
principalmente por consultores y contadores que atienden varias empresas.

**Qué no es.** No es un ERP. No es un sistema contable ni fiscal. No compite con Odoo,
CONTPAQi ni Aspel: se alimenta de ellos.

**Decisión de origen (v2).** Se descartó construir un pseudo-ERP con captura propia como
producto central. Razones: la captura es la parte más difícil de ganar y la de menor valor
percibido; el control fiscal en México (CFDI, contabilidad electrónica) es una barrera
regulatoria enorme; y competiríamos contra software gratuito con veinte años de ventaja.
Como capa de BI dejamos de competir con el ERP y pasamos a complementarlo.

**Mercado objetivo.** PyMEs mexicanas con ERP instalado, alcanzadas a través de
implementadores y despachos contables. El consultor es quien paga y quien distribuye.

**Ventaja competitiva.** No es la conectividad —eso lo hace cualquiera— sino el
**mapeo semántico** de implementaciones heterogéneas y el **criterio financiero**
codificado en el motor de insights. Dos instancias de Odoo nunca se parecen; traducir
cualquiera de ellas a un modelo canónico correcto es el producto.

---

## 2. Principios que cambian entre v1 y v2

La v1 se construyó sobre "nada sale del navegador". La v2 rompe ese principio de forma
deliberada y controlada:

| Principio v1 | Estado en v2 | Razón |
|---|---|---|
| Sin backend | **Cambia.** Funciones serverless + base de datos | Persistencia, comparativos, conectores e integración con Banxico lo exigen |
| Sin almacenamiento en navegador | **Se relaja para preferencias de interfaz** (tema, idioma, layout). Nunca para datos financieros | El tema no es un dato financiero |
| Motor de cálculo puro y aislado | **Se refuerza** | Es lo que permite cambiar de origen de datos sin reescribir nada |
| Ausencia de dato ≠ dato en cero | **Se refuerza** | Más orígenes = más huecos posibles |
| Degradación elegante | **Se refuerza** | Un ERP mal implementado es un dataset incompleto |

**Consecuencia directa:** desde el momento en que se guardan datos de terceros, el
proyecto adquiere obligaciones legales (LFPDPPP), contractuales y de seguridad que antes
no tenía. La fase v1.2 no arranca sin la sección de seguridad resuelta.

---

## 3. Fases

Cada fase tiene criterios de entrada y de salida. No se abre una fase sin cerrar la
anterior.

### v1.1 — Interfaz (1 semana)

Mejoras sobre lo existente. Sin cambios de arquitectura, sin persistencia.

- Panel de validación comprimido por defecto, con énfasis proporcional a la severidad.
  Con errores presentes el panel no se colapsa del todo: queda una línea con el conteo y
  un acceso directo al primer error.
- Tema claro / oscuro / sistema. Tonos semánticos con variantes propias en oscuro; la
  impresión siempre en claro.
- Rejilla responsiva con `auto-fit` y `minmax()`. En móvil: tablas de resumen como
  tarjetas, tablas de detalle con scroll horizontal y primera columna fija.

**Salida:** desplegado en producción y usado con el cliente actual. Retroalimentación real
antes de invertir en v1.2.

### v1.2 — Persistencia y comparativos (3–4 semanas)

La fase de mayor retorno por esfuerzo de todo el roadmap.

- Supabase con **Row Level Security activado desde el primer día**, no después.
- Autenticación y **modelo multiempresa desde el diseño**: un consultor, N empresas. No
  es una funcionalidad, es el modelo de datos. Rehacerlo después es carísimo.
- **Comparativos entre periodos**: mes anterior, mismo mes del año anterior, acumulado
  contra acumulado. Es el hueco más grande de la v1. "Vendimos $4.5M" no informa;
  "vendimos $4.5M, 18% menos que el año pasado" sí.
- **Cierre de periodo inmutable**: al emitir un reporte se congelan datos, tipos de
  cambio, parámetros y versión de la aplicación. Reabrirlo un año después muestra
  exactamente lo que vio el socio. Sin esto la herramienta no sirve para nada auditable.
- Aviso de privacidad, política de retención y borrado, contrato de tratamiento de datos.

**Entrada:** sección de seguridad y documentos legales redactados.
**Salida:** un consultor puede administrar tres empresas, comparar periodos y emitir
reportes cerrados.

### v1.3 — Divisas y volumen histórico (2–3 semanas)

- **El tipo de cambio se congela con la transacción, nunca se consulta al reportar.** Un
  reporte de julio debe dar el mismo número hoy y en diciembre. Cada operación guarda
  importe en moneda original, moneda y tipo de cambio aplicado.
- Integración con la **API del SIE de Banxico** mediante función serverless (CORS impide
  consumirla desde el navegador). Se usa para *sugerir* el tipo de cambio al capturar; el
  usuario siempre puede sobrescribirlo.
- Regla explícita y visible para días sin publicación (fines de semana, feriados): se usa
  el último tipo publicado y el reporte indica cuál se aplicó.
- Alta de divisas por el usuario.
- Volumen: paginación virtualizada, memoización por periodo, agregación por trimestre y
  año, parseo en Web Worker.

### v2.0 — Conector de Odoo (6–8 semanas)

El núcleo de la propuesta de valor.

- **Capa de transporte aislada.** El código de negocio pide "facturas emitidas del periodo
  X"; un adaptador decide si eso se resuelve por XML-RPC (Odoo 16–18) o por el API JSON-2
  en `/json/2/{model}/{method}` (Odoo 19+). Mezclar protocolo con lógica obliga a
  reescribir en cada versión de Odoo.
- Autenticación con **API key, nunca contraseña**, y usuario dedicado de solo lectura con
  permisos mínimos. Nunca se piden credenciales de administrador.
- **Mapeo semántico configurable** de modelos de Odoo al esquema canónico: `sale.order`,
  `sale.order.line`, `account.move`, `account.move.line`, `res.partner`,
  `product.template`, `stock.quant`, `account.payment`, `account.analytic.line`. El
  consultor ajusta el mapeo según cómo esté armada esa instancia.
- Sincronización incremental por `write_date`, con paginación de 500–1000 registros.
- **Módulo de calidad de captura** (sección 5).
- Topologías: se implementa primero la conexión directa a instancias públicamente
  alcanzables (Odoo.sh, autohospedado con IP pública, Online en plan Custom). El agente
  para redes cerradas se pospone a v2.1.

**Entrada:** al menos un cliente con Odoo accesible dispuesto a servir de piloto.
**Salida:** una instancia real de Odoo produce los seis módulos sin captura manual.

### v2.1 — Agente para redes cerradas (3 semanas)

Componente independiente instalado del lado del cliente que hace **únicamente conexiones
salientes**: lee Odoo en la red local y empuja al servicio. No requiere abrir puertos de
entrada, que es lo que hace que un área de TI lo apruebe. Mismo patrón que los conectores
on-premise de Fivetran o Power BI.

Alternativa a evaluar en su momento: un módulo de Odoo instalado en la instancia del
cliente. Ventaja: sabemos escribir módulos de Odoo y la mayoría de los competidores no.
Desventaja: no funciona en Odoo Online y nos hace responsables de código corriendo dentro
del ERP del cliente.

### v2.2 — Captura empresarial ampliada (4 semanas)

Ordenada por qué reporte desbloquea cada cosa:

1. **Inventario** (existencias, costo, ubicación) → rotación, días de inventario, capital
   inmovilizado. Es el hueco más grande hoy.
2. **Activos fijos** con depreciación → EBITDA real.
3. **Pasivos y deuda** → apalancamiento, cobertura de intereses.
4. **Capital contable** (aportaciones, retiros, utilidades retenidas) → posición de los
   socios. Literalmente lo que pedía el cliente original.
5. **Centros de costo** → rentabilidad por sucursal o línea de negocio.
6. **Presupuesto** → variación presupuesto contra real. Convierte el reporte en
   herramienta de gestión.

### v2.3 — Rediseño y personalización (4 semanas)

- **shadcn/ui sobre Radix**: componentes que se copian al repositorio, accesibles, sin
  estilos propios, construidos sobre Tailwind. Cero bloqueo tecnológico. Resuelve lo que
  falta: diálogos, menús, selects, tooltips, tabs accesibles.
- **Motion** para animación, con mano ligera: 150–200 ms en cambios de estado, nada
  decorativo.
- Descartadas: MUI y Semantic UI (pelean con Tailwind, imponen lenguaje visual propio,
  Semantic prácticamente sin mantenimiento); Aceternity y Magic UI (hechas para landing
  pages, registro equivocado); GSAP y Animate.css (artillería pesada); Swiper (no hay
  carruseles en reportería).
- **Plantillas de reporte por destinatario** (socio, banco, contador) **antes que
  dashboards arrastrables.** Resuelven el 90% de la necesidad real con una fracción del
  esfuerzo; la personalización libre es de las funcionalidades que más se piden y menos se
  usan.
- Personalización libre (`dnd-kit` + `react-grid-layout`) **solo si los usuarios la
  piden.** Si se construye, exige un motor de layout de impresión propio: con widgets
  arbitrarios `window.print()` deja de servir.

**Nota de criterio visual:** en software financiero, atractivo significa denso, legible y
sobrio. La referencia estética es Stripe o Mercury, no una landing de startup. Degradados
y animaciones de entrada se perciben como menos confiables, no más.

### v3.0 — Múltiples orígenes

CONTPAQi y Aspel. La base instalada de PyMEs mexicanas no está en Odoo: está ahí. Odoo es
el punto de entrada por expertise, no por tamaño de mercado.

Si la capa de mapeo está bien diseñada, **agregar un origen es un adaptador, no una
reescritura**. Ese es el criterio de diseño de toda la v2.0, aunque v3 nunca se construya.

### Backlog sin fase asignada

- Envío automático mensual del reporte por correo. Convierte uso esporádico en
  suscripción: la gente paga por lo que no tiene que acordarse de hacer.
- Alertas por umbral (cliente sobre su límite de crédito, cartera vencida sobre 30%).
- Plantillas por giro: comercializadora, servicios, manufactura, agropecuario.
- Números de página en el PDF impreso.
- Edición de filas provenientes del archivo.

---

## 4. Decisiones arquitectónicas

Registrar en `docs/decisiones.md` al implementarlas.

**AD-01. El tipo de cambio se congela con la transacción.** Consultarlo al generar el
reporte haría que el mismo reporte diera números distintos con el tiempo. Inaceptable en
información financiera.

**AD-02. Transporte aislado del negocio.** Adaptador por protocolo y por versión de ERP,
detrás de una interfaz común. XML-RPC y JSON-RPC están programados para eliminarse en Odoo
22 (otoño 2028) y en Online 21.1 (invierno 2027); el JSON-2 es el reemplazo. Habrá que
soportar ambos durante años.

**AD-03. Solo lectura, permisos mínimos.** El producto nunca escribe en el ERP del
cliente. Elimina toda una clase de riesgo y facilita la aprobación de TI.

**AD-04. Multiempresa en el modelo de datos, no como funcionalidad.** Desde el primer
esquema de base de datos.

**AD-05. RLS desde el primer día.** El RLS mal configurado es la causa número uno de
filtraciones en proyectos con Supabase.

**AD-06. El motor de cálculo no conoce el origen de los datos.** Recibe el esquema
canónico. Es la razón por la que v1 sobrevive a v2.

---

## 5. Módulo de calidad de captura

Funcionalidad nueva, derivada del diagnóstico de implementación. Tiene dos usos distintos:
**diagnóstico técnico** para el consultor y **medición de disciplina operativa** para la
dirección.

**Completitud.** % de ventas con costo capturado · % con cliente identificado (no "Público
general") · % con condiciones de crédito · % de productos con categoría · % de facturas
conciliadas con pagos.

**Oportunidad.** Días entre la fecha de la operación y la fecha de captura. Es el indicador
de disciplina operativa: una empresa que captura sus ventas con nueve días de retraso tiene
un problema de gestión, no de software. Y explica por qué sus reportes de cierre siempre
llegan tarde.

**Consistencia.** Duplicados probables · márgenes atípicos · variantes del mismo producto
o cliente capturadas como registros distintos · catálogos sin estructura.

**Uso comercial.** El diagnóstico es gratuito y revela problemas reales; el remedio es
consultoría o el producto. Convierte la ventaja competitiva en motor de generación de
prospectos.

**Advertencia de diseño.** La métrica de oportunidad puede desglosarse por usuario, y ahí
hay un riesgo real: medir individuos genera incentivos perversos —capturar rápido y mal
para mejorar el número— y puede usarse de forma punitiva. **Por defecto se presenta
agregada por equipo o por área**, con desglose individual como opción explícita. La
herramienta debe servir para mejorar el proceso, no para vigilar personas.

---

## 6. Riesgos

**El API externo de Odoo no está en todos los planes.** El acceso a datos vía API externo
solo está disponible en los planes Custom; no está disponible en One App Free ni Standard.
Eso deja fuera a buena parte de las PyMEs en Odoo Online. Redefine el mercado objetivo
hacia instancias autohospedadas, Odoo.sh y planes Custom —que es el perfil que contrata
implementador— y obliga a detectar el plan en el onboarding para no vender una conexión
imposible.

**Deprecación de XML-RPC y JSON-RPC.** Mitigado por AD-02, pero fija una fecha límite real.

**Heterogeneidad de implementaciones.** Es simultáneamente el riesgo principal y la
ventaja competitiva. Mitigación: mapeo configurable y diagnóstico que declare qué no se
puede calcular y por qué.

**Odoo tiene su propia reportería.** Diferenciación: consolidación multiempresa, capa
narrativa de hallazgos, análisis de cartera y provisiones, y formato pensado para un dueño
o socio no técnico. No competir en reportes operativos, donde Odoo es mejor.

**Custodia de datos financieros de terceros.** Obligaciones LFPDPPP, respaldos, retención,
borrado y contrato. No se arranca v1.2 sin esto resuelto.

**Mercado de reportería genérica saturado** (Power BI, Looker, Fathom, LiveFlow). La
defensa es el nicho: PyME mexicana con ERP, operada por consultores. Un producto genérico
hecho por una persona no gana ahí.

**Dominio y marca.** Verificar `.com` disponible y la marca en el IMPI antes de
comprometerse con un nombre. En software financiero B2B un nombre sobrio genera más
confianza que uno ingenioso.
