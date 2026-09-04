/**
 * IDs y reglas de la cuenta Kommo de Kenet Solar (cuenta 30948147,
 * subdominio samuelkenetsolarcom). Son los MISMOS que usan el salesbot
 * (repo Kommo-ia: fase1-webhook/main.py, kommo_snapshot.json) y el dashboard
 * de marketing (repo MKT-Autonomus: crm_kommo.py). Si cambia algo en Kommo,
 * se cambia aquí y en esos dos repos.
 */
export const KENET = {
  accountId: 30948147,
  subdomain: "samuelkenetsolarcom",

  pipelines: {
    ventas: 14175132,
    cadenciaRecibo: 14157248,
    hunting: 14213728,
    leadsNuevos: 12753132,
    redesOrganico: 13463080,
  },

  stages: {
    /** Globales: valen en cualquier pipeline. */
    won: 142,
    lost: 143,
    cadenciaEntrantes: 109293108,
    cadenciaDiario: 109293116,
    cadenciaSemanal: 109293120,
    cadenciaMensual: 109293140,
    cadenciaAsignarManual: 110297040,
    /** Etapa «Duplicados» de Cadencia: tarjetas archivadas, no reciben actividad. */
    cadenciaDuplicados: 110671492,
    ventasPorContactar: 109665668,
    ventasConversacion: 110346332,
    ventasLevantamientoAgendado: 110266952,
  },

  /** Campos personalizados del LEAD. */
  leadFields: {
    utmSource: 1823742,
    utmMedium: 1823738,
    utmCampaign: 1823740,
    utmContent: 1823736,
    utmTerm: 1823744,
    utmReferrer: 1823746,
    referrer: 1823748,
    gclientid: 1823750,
    gclid: 1823752,
    fbclid: 1823754,
    tiktokAdId: 1824030,
    tiktokAdName: 1824032,
    tiktokAdUrl: 1824034,
    ttadId: 1831294,
    ttadName: 1831296,
    /** select «Origen»: Facebook - Ad / Facebook - Organic / Instagram - Organic /
     *  Tiktok - Ad / Tiktok - Organic / Web Form - Organic / Directo / Cambaceo / Referido */
    origen: 1833317,
    fbAdId: 1833277,
    fbAdNombre: 1833279,
    fbAdUrl: 1833281,
    reciboRecibido: 1833111,
    ia: 1833271,
    intentosLlamada: 1833303,
    intentosRecibo: 1833379,
    proximaCita: 1831443,
    cotizacionEntregada: 1833423,
    levantamientoSolicitado: 1833425,
    levDireccion: 1833327,
    levMunicipio: 1833639,
  },

  /** Campos personalizados del CONTACTO (la ciudad vive aquí, no en el lead). */
  contactFields: {
    ciudad: 1823968,
    interes: 1823970,
    ultimaAsignacion: 1833389,
    llamarContacto: 1833325,
  },

  users: {
    samuel: 9230887,
    edgarEscalante: 13764939,
    javierGarcia: 13768099,
    marcoPerez: 15137632,
    randall: 15621244,
    carlos: 15690252,
    adriana: 15724552,
  },

  /** Usuarios que NO venden (admin / sistema): sus leads no cuentan como asignados. */
  noVendedores: [15621244],

  /** Grupo de usuarios de Kommo «KS-<zona>» → zona del asesor (regla Kommo-ia, 3-sep-2026). */
  grupoZonaPrefijo: "KS-",

  /** Respaldo cuando el usuario no tiene grupo KS-* (ZONA_POR_ASESOR de Kommo-ia). */
  zonaPorAsesor: {
    9230887: "MTY",
    15137632: "MTY",
    15690252: "MTY",
    15724552: "MTY",
  } as Record<number, string>,

  /** Fuentes de chat (source_id) observadas en la cuenta. */
  sources: {
    whatsapp: 23045767,
    redes: [23044953, 23044955, 23044957],
    /** Número de WhatsApp por el que corre la conversación → zona del número. */
    zonaPorSource: { 23046121: "MTY", 23046217: "TRC" } as Record<number, string>,
  },

  taskTypes: {
    primerContacto: 3953735,
    llamada: 1,
    meeting: 2,
  },

  lossReasons: {
    fueraZona: 14234739,
    sinInteres: 14234735,
  },

  /** Opciones del select Ciudad del contacto. */
  ciudadEnum: ["Monterrey", "Saltillo", "Torreon", "Monclova", "Chihuahua", "Merida"],
} as const;

export type ZonaAsignable = "MTY" | "SLT" | "TRC" | "MVA";
export const ZONAS_ASIGNABLES: ZonaAsignable[] = ["MTY", "SLT", "TRC", "MVA"];
