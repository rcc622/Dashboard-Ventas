import { clasificar } from "../src/lib/kenet/zonas";
import { clasificarCanal } from "../src/lib/kenet/canal";

// Los mismos casos del __main__ de zonas.py
const casos: Array<[Record<string, string>, string]> = [
  [{ city: "monterrey" }, "MTY"], [{ city: "apodaca" }, "MTY"],
  [{ city: "san nicolas de los garza" }, "MTY"], [{ city: "montemorelos" }, "MTY"],
  [{ city: "saltillo coahuila" }, "SLT"], [{ city: "ramos arizpe" }, "SLT"],
  [{ city: "gomez palacio" }, "TRC"], [{ city: "torreon coahuila" }, "TRC"],
  [{ city: "lerdo" }, "TRC"], [{ city: "san pedro de las colonias" }, "TRC"],
  [{ city: "monclova vieja" }, "MVA"], [{ city: "frontera" }, "MVA"],
  [{ city: "nueva rosita" }, "MVA"], [{ city: "sabinas coahuila" }, "MVA"],
  [{ city: "sabinas hidalgo" }, "MTY"],
  [{ city: "tampico" }, "FUERA"], [{ city: "acuna" }, "FUERA"],
  [{ city: "piedras negras" }, "FUERA"], [{ city: "cancun" }, "FUERA"],
  [{ city: "matamoros" }, "AMBIGUO"],
  [{ city: "matamoros tamaulipas" }, "FUERA"],
  [{ city: "matamoros", state: "Coahuila" }, "TRC"],
  [{ city: "juarez" }, "AMBIGUO"], [{ city: "juarez nl" }, "MTY"],
  [{ city: "ciudad juarez" }, "FUERA"],
  [{ city: "guadalupe", ciudad: "Monterrey" }, "MTY"],
  [{ city: "reynosa", ciudad: "Monterrey" }, "FUERA"],
  [{ ciudad: "Torreón" }, "TRC"], [{ ciudad: "Merida" }, "FUERA"],
  [{}, "SIN_DATO"], [{ ciudad: "Otro" }, "AMBIGUO"],
  [{ city: "Gómez Palacio, Dgo." }, "TRC"], [{ city: "Escobedo" }, "AMBIGUO"],
];
let malos = 0;
for (const [kw, esperado] of casos) {
  const [z, motivo] = clasificar(kw);
  if (z !== esperado) { malos++; console.log("FALLA", JSON.stringify(kw), "->", z, "(esperaba", esperado + ")", motivo); }
}
console.log(`zonas: ${casos.length - malos}/${casos.length} casos OK`);

const canales: Array<[Parameters<typeof clasificarCanal>[0], string]> = [
  [{ utmSource: "meta", utmMedium: "ctwa" }, "Meta Ads"],
  [{ utmSource: "meta", utmMedium: "lead_form" }, "Meta Ads"],
  [{ fbclid: "abc" }, "Meta Ads"],
  [{ origen: "Facebook - Ad" }, "Meta Ads"],
  [{ origen: "Facebook - Organic" }, "Redes orgánico"],
  [{ origen: "Instagram - Organic" }, "Redes orgánico"],
  [{ origen: "Web Form - Organic" }, "Web orgánico"],
  [{ origen: "Web Form - Ad", utmSource: "google" }, "Google Ads"],
  [{ utmCampaign: "KS_MTY_SEARCH_PANELES", utmSource: "web" }, "Google Ads"],
  [{ utmSource: "google", utmMedium: "lead_form" }, "Google Ads"],
  [{ utmSource: "tiktok" }, "TikTok Ads"],
  [{ tiktokAdId: "17423" }, "TikTok Ads"],
  [{ origen: "Tiktok - Ad" }, "TikTok Ads"],
  [{ origen: "Tiktok - Organic" }, "Redes orgánico"],
  [{ utmSource: "web", utmMedium: "formulario" }, "Web orgánico"],
  [{ utmMedium: "wix-form" }, "Web orgánico"],
  [{ origen: "Directo" }, "Directo"],
  [{ origen: "Referido" }, "Referido"],
  [{ sourceId: 23044953 }, "Redes orgánico"],
  [{ sourceId: 23045767 }, "Directo"],
  [{ tags: ["Google Ads"] }, "Google Ads"],
  [{ tags: ["Meta Lead Ads"] }, "Meta Ads"],
  [{}, "Sin origen"],
];
let malosC = 0;
for (const [x, esperado] of canales) {
  const c = clasificarCanal(x);
  if (c !== esperado) { malosC++; console.log("FALLA canal", JSON.stringify(x), "->", c, "(esperaba", esperado + ")"); }
}
console.log(`canal: ${canales.length - malosC}/${canales.length} casos OK`);
if (malos || malosC) process.exit(1);
