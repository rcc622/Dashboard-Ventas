import type { Advisor, Lead, Snapshot } from "@/lib/model";
import { norm } from "@/lib/kenet/zonas";

/** Nombre normalizado para cruzar personas entre plataformas. */
export function nombreKey(s: string | null | undefined): string {
  const n = norm(s);
  // Kommo nombra los leads «Juan Pérez — Google Ads» / «Juan Pérez - Web»: se queda lo de antes del guion.
  return n.split(/\s[-–—]\s|\s—|—\s/)[0].trim();
}

export interface Indices {
  leadPorTelefono: Map<string, Lead>;
  leadPorNombre: Map<string, Lead>;
  asesorPorNombre: Map<string, Advisor>;
}

const prioridad = (l: Lead) => (l.status === "won" ? 3 : l.status === "open" ? 2 : 1);

/** Índices por teléfono y nombre. Ante empate manda el lead ganado, luego el abierto, luego el más reciente. */
export function construirIndices(s: Snapshot): Indices {
  const leadPorTelefono = new Map<string, Lead>();
  const leadPorNombre = new Map<string, Lead>();
  const mejor = (map: Map<string, Lead>, key: string, l: Lead) => {
    const actual = map.get(key);
    if (!actual || prioridad(l) > prioridad(actual) || (prioridad(l) === prioridad(actual) && l.createdAt > actual.createdAt)) map.set(key, l);
  };
  const contactName = new Map(s.contacts.map((c) => [c.id, c.name]));
  for (const l of s.leads) {
    if (l.phoneKey) mejor(leadPorTelefono, l.phoneKey, l);
    const k1 = nombreKey(l.name);
    if (k1) mejor(leadPorNombre, k1, l);
    const k2 = l.contactId ? nombreKey(contactName.get(l.contactId)) : "";
    if (k2 && k2 !== k1) mejor(leadPorNombre, k2, l);
  }
  const asesorPorNombre = new Map<string, Advisor>();
  for (const a of s.advisors) {
    const k = nombreKey(a.name);
    if (k) asesorPorNombre.set(k, a);
    // también por primer nombre + primer apellido («Mara Gálvez Ruiz» ↔ «Mara Galvez»)
    const partes = k.split(" ");
    if (partes.length >= 2) asesorPorNombre.set(partes.slice(0, 2).join(" "), a);
  }
  return { leadPorTelefono, leadPorNombre, asesorPorNombre };
}

export function asesorPorNombre(idx: Indices, nombre: string | null | undefined): Advisor | undefined {
  const k = nombreKey(nombre);
  if (!k) return undefined;
  const directo = idx.asesorPorNombre.get(k) ?? idx.asesorPorNombre.get(k.split(" ").slice(0, 2).join(" "));
  if (directo) return directo;
  // «Luis Hernández» (comisiones) ↔ «Luis» (Kommo): por primer nombre, solo si es único entre los asesores.
  const primero = k.split(" ")[0];
  const candidatos = new Set<Advisor>();
  for (const [key, a] of idx.asesorPorNombre) if (key.split(" ")[0] === primero) candidatos.add(a);
  return candidatos.size === 1 ? [...candidatos][0] : undefined;
}

export function leadPorNombre(idx: Indices, nombre: string | null | undefined): Lead | undefined {
  const k = nombreKey(nombre);
  return k ? idx.leadPorNombre.get(k) : undefined;
}
