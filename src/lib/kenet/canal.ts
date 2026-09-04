/**
 * Canal de entrada del lead — un solo lugar donde se decide (mismo criterio que
 * `canal_del_lead` de MKT-Autonomus/crm_kommo.py, ampliado con TikTok, Google
 * por utm_source y las etiquetas que escribe la ingesta de formularios de Kommo-ia).
 *
 * Orden de prioridad:
 *   1. campaña de búsqueda de Google (token SEARCH) o utm_source=google → Google Ads
 *   2. TikTok: utm_source=tiktok, id de anuncio TikTok u origen «Tiktok - Ad» → TikTok Ads
 *   3. select Origen (lo escribe el salesbot / el asesor)
 *   4. utm_medium=ctwa, utm_source de Meta, fbclid o id de anuncio FB → Meta Ads
 *   5. utm_medium=wix-form / utm_source=web → Web orgánico
 *   6. fuente del chat (redes / WhatsApp) → Redes orgánico / Directo
 *   7. etiqueta del formulario (Google Ads / Meta Lead Ads / TikTok Ads / Web)
 *   8. Sin origen
 */
import { KENET } from "./ids";

export const CANALES = [
  "Meta Ads",
  "Google Ads",
  "TikTok Ads",
  "Web orgánico",
  "Redes orgánico",
  "Referido",
  "Directo",
  "Sin origen",
] as const;

export type Canal = (typeof CANALES)[number];

/** Canales con gasto pagado detrás. */
export const CANALES_PAGADOS: ReadonlySet<Canal> = new Set<Canal>(["Meta Ads", "Google Ads", "TikTok Ads"]);

export interface CanalInput {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  origen?: string | null;
  fbclid?: string | null;
  fbAdId?: string | null;
  tiktokAdId?: string | null;
  sourceId?: number | null;
  tags?: readonly string[];
}

const META_TOKENS = ["meta", "facebook", "instagram", "fb", "ig"];
const TOKEN_GOOGLE = "SEARCH";

const low = (v: string | null | undefined): string => (v ?? "").trim().toLowerCase();

function esDeMeta(x: CanalInput): boolean {
  const src = low(x.utmSource);
  if (src && META_TOKENS.some((t) => src.includes(t))) return true;
  return Boolean(low(x.fbclid)) || Boolean(low(x.fbAdId));
}

export function clasificarCanal(x: CanalInput): Canal {
  const campaign = (x.utmCampaign ?? "").toUpperCase();
  const src = low(x.utmSource);
  const med = low(x.utmMedium);
  const origen = low(x.origen);

  if (campaign.includes(TOKEN_GOOGLE) || src === "google") return "Google Ads";
  if (src === "tiktok" || low(x.tiktokAdId) || (origen.includes("tiktok") && origen.includes("ad") && !origen.includes("organic"))) {
    return "TikTok Ads";
  }

  if (origen) {
    if (origen.includes("organic")) return origen.includes("web") ? "Web orgánico" : "Redes orgánico";
    if (origen.includes("referido") || origen.includes("cambaceo") || origen.includes("recomend")) return "Referido";
    if (origen.includes("directo")) return "Directo";
    if (origen.includes("ad")) return origen.includes("web") && src === "google" ? "Google Ads" : "Meta Ads";
  }

  if (med === "ctwa" || esDeMeta(x)) return "Meta Ads";
  if (med === "wix-form" || src === "web") return "Web orgánico";

  if (x.sourceId != null) {
    if ((KENET.sources.redes as readonly number[]).includes(x.sourceId)) return "Redes orgánico";
    if (x.sourceId === KENET.sources.whatsapp) return "Directo";
  }

  for (const tag of x.tags ?? []) {
    const t = low(tag);
    if (t === "google ads") return "Google Ads";
    if (t === "meta lead ads") return "Meta Ads";
    if (t === "tiktok ads") return "TikTok Ads";
    if (t === "web" || t === "web form") return "Web orgánico";
    if (t === "referido" || t === "cambaceo") return "Referido";
  }

  return "Sin origen";
}
