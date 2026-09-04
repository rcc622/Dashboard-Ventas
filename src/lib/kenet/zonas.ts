/**
 * Zonas de asignación de Kenet — port fiel de MKT-Autonomus/zonas.py, la única
 * fuente de verdad de «¿este lead es nuestro?». Si cambia la cobertura, se
 * cambia allá y aquí igual.
 *
 * Cobertura (acordada 2026-07-28):
 *   MTY  Monterrey, su zona metropolitana y el resto de Nuevo León.
 *   SLT  Saltillo y su zona metropolitana (Ramos Arizpe, Arteaga, General Cepeda, Parras).
 *   TRC  Torreón y la Comarca Lagunera (Coahuila y Durango).
 *   MVA  Monclova, Región Centro y Región Carbonífera.
 *
 * Veredictos: MTY/SLT/TRC/MVA (asignable) · FUERA · AMBIGUO (homónimo sin estado) · SIN_DATO.
 */

export type Zona = "MTY" | "SLT" | "TRC" | "MVA" | "FUERA" | "AMBIGUO" | "SIN_DATO";
export const ZONAS = ["MTY", "SLT", "TRC", "MVA"] as const;
export const ASIGNABLE: ReadonlySet<string> = new Set(ZONAS);

/** minúsculas, sin acentos, sin puntuación, espacios colapsados. */
export function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Estados pegados al nombre de la ciudad («juarez nl»): desempatan homónimos. */
const ESTADOS: Record<string, string> = {
  "nuevo leon": "NL", nl: "NL", "n l": "NL", nuevoleon: "NL",
  coahuila: "COAH", coah: "COAH", "coahuila de zaragoza": "COAH",
  tamaulipas: "TAMS", tamps: "TAMS", tam: "TAMS",
  chihuahua: "CHIH", chih: "CHIH",
  durango: "DGO", dgo: "DGO",
  zacatecas: "ZAC", "san luis potosi": "SLP", slp: "SLP",
  guanajuato: "GTO", gto: "GTO", yucatan: "YUC", jalisco: "JAL",
};

const CIUDADES = new Map<string, Zona>();

function registrar(zona: Zona, lista: string): void {
  for (const nombre of lista.replace(/\n/g, "").split("|")) {
    const n = norm(nombre);
    if (n) CIUDADES.set(n, zona);
  }
}

// --- MTY: Nuevo León completo (área metropolitana + circunvecinas) ------------
registrar("MTY", `
Monterrey|Mty|Monterey|Nuevo Leon|San Pedro Garza Garcia|San Nicolas de los Garza|
San Nicolas|Apodaca|Ciudad Apodaca|General Escobedo|Santa Catarina|Garcia|
Cadereyta Jimenez|Cadereyta|Salinas Victoria|Cienega de Flores|El Carmen|Pesqueria|
Montemorelos|Linares|Hualahuises|General Teran|China|Doctor Gonzalez|Dr Gonzalez|
Marin|Higueras|Mina|Bustamante|Villaldama|Sabinas Hidalgo|Agualeguas|Cerralvo|
Los Ramones|Los Herreras|Melchor Ocampo|Paras|Vallecillo|Anahuac|Lampazos de Naranjo|
Lampazos|Doctor Coss|Dr Coss|General Bravo|General Zuazua|Zuazua|Ciudad Benito Juarez|
Ciudad General Escobedo|Rayones|Galeana|Iturbide|Aramberri|Doctor Arroyo|Mier y Noriega|
General Zaragoza|Villa de Santiago|San Pedro|Guadalupe Nuevo Leon|Juarez Nuevo Leon
`);

// --- SLT: Saltillo y zona metropolitana --------------------------------------
registrar("SLT", "Saltillo|Ramos Arizpe|Arteaga|General Cepeda|Parras|Parras de la Fuente|Derramadero");

// --- TRC: Torreón y Comarca Lagunera (Coahuila + Durango) --------------------
registrar("TRC", `
Torreon|Gomez Palacio|Lerdo|Ciudad Lerdo|San Pedro de las Colonias|
Francisco I Madero|Viesca|Tlahualilo|Mapimi|Bermejillo|Nazas|Rodeo|Cuencame|
San Juan de Guadalupe|General Simon Bolivar|Santa Clara Durango|Nuevo Ideal|
La Laguna|Comarca Lagunera|Ciudad Juarez Durango
`);

// --- MVA: Monclova, Región Centro y Región Carbonífera ----------------------
registrar("MVA", `
Monclova|Monclova Vieja|Ciudad Monclova|Frontera|Castanos|Nadadores|
San Buenaventura|Cuatro Cienegas|Candela|Sacramento|Lamadrid|Nueva Rosita|
San Juan de Sabinas|Melchor Muzquiz|Muzquiz|Palau|Agujita|Cloete|Sabinas Coahuila
`);

// --- FUERA explícito: Coahuila que NO cubrimos y las plazas que más aparecen --
registrar("FUERA", `
Acuna|Ciudad Acuna|Piedras Negras|Nava|Zaragoza|Guerrero|Villa Union|
Jimenez|Ocampo|Sierra Mojada|Hidalgo Coahuila|Morelos Coahuila|Allende Coahuila|
Tampico|Reynosa|Nuevo Laredo|Ciudad Victoria|Ciudad Madero|Madero|Altamira|
Ciudad Mante|Rio Bravo|Valle Hermoso|Heroica Matamoros|Miramar|
Chihuahua|Ciudad Juarez|Delicias|Cuauhtemoc|Hidalgo del Parral|Nuevo Casas Grandes|
Durango|Guadalajara|Zapopan|Tlaquepaque|Tonala|Leon|Leon Gto|Irapuato|Celaya|
Salamanca|Guanajuato|San Miguel de Allende|Queretaro|San Juan del Rio|
San Luis Potosi|Soledad de Graciano Sanchez|Ciudad Valles|Zacatecas|Fresnillo|
Sombrerete|Aguascalientes|Culiacan|Los Mochis|Mazatlan|Hermosillo|Ciudad Obregon|
Navojoa|Guaymas|Nogales|San Luis Rio Colorado|Tijuana|Mexicali|Ensenada|
La Paz|Cabo San Lucas|San Jose del Cabo|Los Cabos|Colima|Villa de Alvarez|
Manzanillo|Ciudad Guzman|Morelia|Uruapan|Zamora|Tepic|Puebla|Tehuacan|
Cuautlancingo|Izucar de Matamoros|Cuernavaca|Jiutepec|Cuautla|Toluca|Ecatepec|
Nezahualcoyotl|Naucalpan|Naucalpan de Juarez|Tlalnepantla|Chalco|Chicoloapan|
Chimalhuacan|Ixtapaluca|Cuautitlan|Cuautitlan Izcalli|Texcoco de Mora|Ojo de Agua|
Ciudad Lopez Mateos|San Francisco Coacalco|San Pablo de las Salinas|Tepexpan|
Villa Nicolas Romero|Ciudad de Mexico|Ciudad de Mexico DF CDMX|Cdmx|Mexico City|
Mexico|Df|Pachuca|Tulancingo de Bravo|Veracruz|Coatzacoalcos|Minatitlan|
Minatitlan Veracruz|Cordoba|Orizaba|Xalapa Enriquez|Xalapa|Poza Rica de Hidalgo|
Xico|Villahermosa|Tabasco|Campeche|Ciudad del Carmen|Merida|Cancun|
Playa del Carmen|Chetumal|Mahahual|Benito Juarez Quintana Roo|Oaxaca|
Oaxaca de Juarez|San Juan Bautista Tuxtepec|Tuxtla|San Cristobal de las Casas|
Tapachula|Acapulco|Chilpancingo|Iguala|Taxco|Colima Colima|Chicago|London
`);

/** Homónimos: el mismo nombre existe en dos estados. Sin estado → AMBIGUO. */
const HOMONIMOS: Record<string, Record<string, Zona>> = {
  matamoros: { COAH: "TRC", TAMS: "FUERA" },
  juarez: { NL: "MTY", COAH: "FUERA", CHIH: "FUERA", DGO: "TRC" },
  guadalupe: { NL: "MTY", ZAC: "FUERA" },
  escobedo: { NL: "MTY", COAH: "MVA" },
  abasolo: { NL: "MTY", COAH: "MVA", GTO: "FUERA", TAMS: "FUERA" },
  sabinas: { COAH: "MVA", NL: "MTY" },
  hidalgo: { NL: "MTY", COAH: "FUERA", TAMS: "FUERA", DGO: "FUERA" },
  allende: { NL: "MTY", COAH: "FUERA" },
  santiago: { NL: "MTY" },
  progreso: { COAH: "MVA", YUC: "FUERA" },
  morelos: { COAH: "FUERA" },
  victoria: { TAMS: "FUERA" },
  arteaga: { COAH: "SLT" },
  zaragoza: { COAH: "FUERA", NL: "MTY" },
};

/** Picklist «Ciudad» (contacto en Kommo / HubSpot): un cajón, no un municipio. */
const PICKLIST: Record<string, Zona> = {
  monterrey: "MTY", saltillo: "SLT", torreon: "TRC", monclova: "MVA",
  chihuahua: "FUERA", merida: "FUERA", hermosillo: "FUERA", "san luis potosi": "FUERA",
  guadalajara: "FUERA", leon: "FUERA", otro: "AMBIGUO",
};

const ESTADOS_ORDEN = Object.entries(ESTADOS).sort((a, b) => b[0].length - a[0].length);

/** ('juarez nl') → ['juarez', 'NL'] */
function estadoEn(texto: string | null | undefined): [string, string] {
  const t = norm(texto);
  for (const [sufijo, estado] of ESTADOS_ORDEN) {
    if (t.endsWith(" " + sufijo)) return [t.slice(0, -(sufijo.length + 1)).trim(), estado];
  }
  return [t, ""];
}

/** Clasifica un nombre de ciudad escrito a mano → [zona, estado detectado]. */
export function deTexto(ciudadLibre: string | null | undefined, estado = ""): [Zona, string] {
  const [base, estadoTexto] = estadoEn(ciudadLibre);
  if (!base) return ["SIN_DATO", ""];
  const est = estadoTexto || ESTADOS[norm(estado)] || "";
  const z = CIUDADES.get(base);
  if (z) return [z, est];
  const opciones = HOMONIMOS[base];
  if (opciones) {
    if (est && opciones[est]) return [opciones[est], est];
    return ["AMBIGUO", est];
  }
  return ["FUERA", est];
}

export interface ClasificarInput {
  /** Texto libre (manda sobre el picklist). */
  city?: string | null;
  /** Picklist Ciudad (Kommo: campo del contacto). */
  ciudad?: string | null;
  state?: string | null;
  otraCiudad?: string | null;
}

/** Veredicto [zona, motivo]. El texto libre manda; el picklist desempata. */
export function clasificar({ city, ciudad, state, otraCiudad }: ClasificarInput): [Zona, string] {
  const libre = city || otraCiudad || "";
  const [zTxt, est] = deTexto(libre, state ?? "");
  if (ASIGNABLE.has(zTxt) || zTxt === "FUERA") {
    return [zTxt, `city=${norm(libre)}${est ? "/" + est : ""}`];
  }
  const zPick: Zona = PICKLIST[norm(ciudad)] ?? (ciudad ? "AMBIGUO" : "SIN_DATO");
  if (ASIGNABLE.has(zPick) || zPick === "FUERA") return [zPick, `ciudad=${norm(ciudad)}`];
  if (zTxt === "AMBIGUO" || zPick === "AMBIGUO") {
    return ["AMBIGUO", `sin estado: ${norm(libre || ciudad) || "?"}`];
  }
  return ["SIN_DATO", "sin ciudad"];
}

export function resumen(valores: Iterable<Zona>): Record<Zona, number> {
  const out: Record<Zona, number> = { MTY: 0, SLT: 0, TRC: 0, MVA: 0, FUERA: 0, AMBIGUO: 0, SIN_DATO: 0 };
  for (const v of valores) out[v] = (out[v] ?? 0) + 1;
  return out;
}
