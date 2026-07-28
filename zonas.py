#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Zonas de asignación de Kenet — la única fuente de verdad de "¿este lead es nuestro?".

Un lead solo cuenta como asignable si su ciudad cae dentro de la cobertura real
del equipo. Fuera de eso no es un lead que alguien vaya a atender: es gasto de
Meta apuntando a donde no vendemos, y se mide aparte para corregir la campaña.

Cobertura (acordada 2026-07-28):
    MTY  Monterrey, su zona metropolitana y el resto de Nuevo León.
    SLT  Saltillo y su zona metropolitana (Ramos Arizpe, Arteaga, General
         Cepeda, Parras).
    TRC  Torreón y la Comarca Lagunera (Coahuila y Durango).
    MVA  Monclova, su zona circunvecina (Región Centro) y la Región Carbonífera
         (Sabinas, Nueva Rosita, Múzquiz).

Todo lo demás es FUERA, incluida buena parte de Coahuila: Acuña, Piedras Negras
y la Región Norte no las cubre nadie.

Cuatro veredictos:
    "MTY"/"SLT"/"TRC"/"MVA"  asignable
    "FUERA"                  ciudad conocida y fuera de cobertura
    "AMBIGUO"                el nombre existe en dos estados y no vino el estado
                             (Matamoros, Juárez, Guadalupe, Escobedo…)
    "SIN_DATO"               no vino ciudad

Lo usan crm_hubspot.py, crm_kommo.py y dashboard.py. Si cambia la cobertura se
cambia aquí y los tres se enteran solos.
"""
import re
import unicodedata

ZONAS = ("MTY", "SLT", "TRC", "MVA")
ASIGNABLE = set(ZONAS)


def norm(s):
    """minúsculas, sin acentos, sin puntuación, espacios colapsados."""
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", s)).strip()


# Estados que aparecen pegados al nombre de la ciudad ("juarez nl", "matamoros
# tamaulipas"). Sirven para desempatar los homónimos.
ESTADOS = {
    "nuevo leon": "NL", "nl": "NL", "n l": "NL", "nuevoleon": "NL",
    "coahuila": "COAH", "coah": "COAH", "coahuila de zaragoza": "COAH",
    "tamaulipas": "TAMS", "tamps": "TAMS", "tam": "TAMS",
    "chihuahua": "CHIH", "chih": "CHIH",
    "durango": "DGO", "dgo": "DGO",
    "zacatecas": "ZAC", "san luis potosi": "SLP", "slp": "SLP",
    "guanajuato": "GTO", "gto": "GTO", "yucatan": "YUC", "jalisco": "JAL",
}

# Municipio -> zona. Sin homónimos: si el nombre está aquí, el veredicto es directo.
CIUDADES = {}


def _reg(zona, nombres):
    for n in nombres:
        CIUDADES[norm(n)] = zona


# --- MTY: Nuevo León completo (área metropolitana + circunvecinas) ------------
_reg("MTY", """
Monterrey|Mty|Monterey|Nuevo Leon|San Pedro Garza Garcia|San Nicolas de los Garza|
San Nicolas|Apodaca|Ciudad Apodaca|General Escobedo|Santa Catarina|Garcia|
Cadereyta Jimenez|Cadereyta|Salinas Victoria|Cienega de Flores|El Carmen|Pesqueria|
Montemorelos|Linares|Hualahuises|General Teran|China|Doctor Gonzalez|Dr Gonzalez|
Marin|Higueras|Mina|Bustamante|Villaldama|Sabinas Hidalgo|Agualeguas|Cerralvo|
Los Ramones|Los Herreras|Melchor Ocampo|Paras|Vallecillo|Anahuac|Lampazos de Naranjo|
Lampazos|Doctor Coss|Dr Coss|General Bravo|General Zuazua|Zuazua|Ciudad Benito Juarez|
Ciudad General Escobedo|Rayones|Galeana|Iturbide|Aramberri|Doctor Arroyo|Mier y Noriega|
General Zaragoza|Villa de Santiago|San Pedro|Guadalupe Nuevo Leon|Juarez Nuevo Leon
""".replace("\n", "").split("|"))

# --- SLT: Saltillo y zona metropolitana --------------------------------------
_reg("SLT", "Saltillo|Ramos Arizpe|Arteaga|General Cepeda|Parras|"
            "Parras de la Fuente|Derramadero".split("|"))

# --- TRC: Torreón y Comarca Lagunera (Coahuila + Durango) --------------------
_reg("TRC", """
Torreon|Gomez Palacio|Lerdo|Ciudad Lerdo|San Pedro de las Colonias|
Francisco I Madero|Viesca|Tlahualilo|Mapimi|Bermejillo|Nazas|Rodeo|Cuencame|
San Juan de Guadalupe|General Simon Bolivar|Santa Clara Durango|Nuevo Ideal|
La Laguna|Comarca Lagunera|Ciudad Juarez Durango
""".replace("\n", "").split("|"))

# --- MVA: Monclova, Región Centro y Región Carbonífera ----------------------
_reg("MVA", """
Monclova|Monclova Vieja|Ciudad Monclova|Frontera|Castanos|Nadadores|
San Buenaventura|Cuatro Cienegas|Candela|Sacramento|Lamadrid|Nueva Rosita|
San Juan de Sabinas|Melchor Muzquiz|Muzquiz|Palau|Agujita|Cloete|Sabinas Coahuila
""".replace("\n", "").split("|"))

# --- FUERA explícito: Coahuila que NO cubrimos y las plazas que más aparecen --
_reg("FUERA", """
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
""".replace("\n", "").split("|"))
CIUDADES.pop("", None)

# Homónimos: el mismo nombre existe en dos estados y el veredicto cambia.
# Sin estado no se adivina — se reporta AMBIGUO y se revisa a mano.
HOMONIMOS = {
    "matamoros":  {"COAH": "TRC", "TAMS": "FUERA"},
    "juarez":     {"NL": "MTY", "COAH": "FUERA", "CHIH": "FUERA", "DGO": "TRC"},
    "guadalupe":  {"NL": "MTY", "ZAC": "FUERA"},
    "escobedo":   {"NL": "MTY", "COAH": "MVA"},
    "abasolo":    {"NL": "MTY", "COAH": "MVA", "GTO": "FUERA", "TAMS": "FUERA"},
    "sabinas":    {"COAH": "MVA", "NL": "MTY"},
    "hidalgo":    {"NL": "MTY", "COAH": "FUERA", "TAMS": "FUERA", "DGO": "FUERA"},
    "allende":    {"NL": "MTY", "COAH": "FUERA"},
    "santiago":   {"NL": "MTY"},
    "progreso":   {"COAH": "MVA", "YUC": "FUERA"},
    "morelos":    {"COAH": "FUERA"},
    "victoria":   {"TAMS": "FUERA"},
    "arteaga":    {"COAH": "SLT"},
    "zaragoza":   {"COAH": "FUERA", "NL": "MTY"},
}

# Picklist `ciudad` de HubSpot: 5 opciones reales + plazas sueltas. Es un cajón,
# no un municipio, así que solo se usa cuando el texto libre no resolvió.
PICKLIST = {"monterrey": "MTY", "saltillo": "SLT", "torreon": "TRC",
            "monclova": "MVA", "chihuahua": "FUERA", "merida": "FUERA",
            "hermosillo": "FUERA", "san luis potosi": "FUERA",
            "guadalajara": "FUERA", "leon": "FUERA", "otro": "AMBIGUO"}


def _estado_en(texto):
    """Devuelve (base_sin_estado, estado) — 'juarez nl' -> ('juarez', 'NL')."""
    t = norm(texto)
    for suf, est in sorted(ESTADOS.items(), key=lambda kv: -len(kv[0])):
        if t.endswith(" " + suf):
            return t[: -(len(suf) + 1)].strip(), est
    return t, ""


def de_texto(ciudad_libre, estado=""):
    """Clasifica un nombre de ciudad escrito a mano. (zona, estado_detectado)."""
    base, est = _estado_en(ciudad_libre)
    if not base:
        return "SIN_DATO", ""
    est = est or ESTADOS.get(norm(estado), "")
    # El nombre completo manda sobre el homónimo: "sabinas hidalgo" es NL aunque
    # "sabinas" solo sea Coahuila.
    z = CIUDADES.get(base)
    if z:
        return z, est
    if base in HOMONIMOS:
        opciones = HOMONIMOS[base]
        if est and est in opciones:
            return opciones[est], est
        return "AMBIGUO", est
    return "FUERA", est


def clasificar(city="", ciudad="", state="", otra_ciudad=""):
    """Veredicto de un lead a partir de lo que traiga el CRM.

    El texto libre (`city`) manda sobre el picklist (`ciudad`): el picklist solo
    tiene cinco cajones y un lead de Tampico acaba marcado "Monterrey" porque no
    hay otra opción. Cuando el texto libre no resuelve, el picklist desempata.

    Devuelve (zona, motivo) donde motivo explica de dónde salió el veredicto —
    se guarda para poder auditar la clasificación sin volver a correr nada.
    """
    z_txt, est = de_texto(city or otra_ciudad, state)
    if z_txt in ASIGNABLE or z_txt == "FUERA":
        return z_txt, "city=%s%s" % (norm(city or otra_ciudad), "/" + est if est else "")
    z_pick = PICKLIST.get(norm(ciudad), "AMBIGUO" if ciudad else "SIN_DATO")
    if z_pick in ASIGNABLE or z_pick == "FUERA":
        return z_pick, "ciudad=%s" % norm(ciudad)
    if z_txt == "AMBIGUO" or z_pick == "AMBIGUO":
        return "AMBIGUO", "sin estado: %s" % (norm(city or ciudad or otra_ciudad) or "?")
    return "SIN_DATO", "sin ciudad"


def resumen(vals):
    """Cuenta veredictos: {'MTY':n, …, 'FUERA':n, 'AMBIGUO':n, 'SIN_DATO':n}."""
    out = {k: 0 for k in list(ZONAS) + ["FUERA", "AMBIGUO", "SIN_DATO"]}
    for v in vals:
        out[v] = out.get(v, 0) + 1
    return out


if __name__ == "__main__":
    casos = [
        ({"city": "monterrey"}, "MTY"), ({"city": "apodaca"}, "MTY"),
        ({"city": "san nicolas de los garza"}, "MTY"), ({"city": "montemorelos"}, "MTY"),
        ({"city": "saltillo coahuila"}, "SLT"), ({"city": "ramos arizpe"}, "SLT"),
        ({"city": "gomez palacio"}, "TRC"), ({"city": "torreon coahuila"}, "TRC"),
        ({"city": "lerdo"}, "TRC"), ({"city": "san pedro de las colonias"}, "TRC"),
        ({"city": "monclova vieja"}, "MVA"), ({"city": "frontera"}, "MVA"),
        ({"city": "nueva rosita"}, "MVA"), ({"city": "sabinas coahuila"}, "MVA"),
        ({"city": "sabinas hidalgo"}, "MTY"),
        ({"city": "tampico"}, "FUERA"), ({"city": "acuna"}, "FUERA"),
        ({"city": "piedras negras"}, "FUERA"), ({"city": "cancun"}, "FUERA"),
        ({"city": "matamoros"}, "AMBIGUO"),
        ({"city": "matamoros tamaulipas"}, "FUERA"),
        ({"city": "matamoros", "state": "Coahuila"}, "TRC"),
        ({"city": "juarez"}, "AMBIGUO"), ({"city": "juarez nl"}, "MTY"),
        ({"city": "ciudad juarez"}, "FUERA"),
        ({"city": "guadalupe", "ciudad": "Monterrey"}, "MTY"),
        # El texto libre gana: picklist "Monterrey" con ciudad real de Tamaulipas.
        ({"city": "reynosa", "ciudad": "Monterrey"}, "FUERA"),
        ({"ciudad": "Torreón"}, "TRC"), ({"ciudad": "Merida"}, "FUERA"),
        ({}, "SIN_DATO"), ({"ciudad": "Otro"}, "AMBIGUO"),
    ]
    malos = 0
    for kw, esperado in casos:
        z, motivo = clasificar(**kw)
        if z != esperado:
            malos += 1
            print("FALLA %-46s -> %-9s (esperaba %s) [%s]" % (kw, z, esperado, motivo))
    print("%d/%d casos OK" % (len(casos) - malos, len(casos)))
    raise SystemExit(1 if malos else 0)
