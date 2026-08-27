#!/usr/bin/env python3
"""
Generate the world: twelve countries, sixteen clubs each, and a goalkeeper for
every one of them.

WHY A GENERATOR RATHER THAN HAND-AUTHORED JSON
----------------------------------------------
Sixteen clubs were worth writing by hand. A hundred and ninety-two are not:
the ratings have to be internally consistent (a club's attack, midfield and
defence must agree with its overall standing, and its style ratings must agree
with its style), and doing that by eye across twelve leagues produces a world
where half the clubs are quietly nonsense.

So the SHAPE is generated and the FLAVOUR is authored. Every club name, place
name and goalkeeper name below is written by hand, country by country, because
those are the part a player actually reads. The numbers are derived from two
authored inputs per club — its standing within its league, and its tactical
style — so a "possession" club always has the possession, passing and
creativity to back it up, and the club lying second always has ratings that
justify lying second.

Every name here is INVENTED. The place names are not real towns and the clubs
are not real clubs; a game that shipped a "Real Madrid" would be borrowing
somebody else's trademark to do a job that a made-up name does just as well.

Run with:  python3 scripts/generateWorld.py
Writes:    src/data/teams.json, src/data/goalkeepers.json

Deterministic: the same script always produces the same world, so the data
files are reproducible and a diff means somebody changed the recipe.
"""

import json
import random

# --------------------------------------------------------------- styles ---

# Style -> how it bends a club's ratings away from its base standing.
# These mirror the biases the situation generator applies, so a club that is
# listed as "wide play" genuinely produces crossing situations.
STYLE_SHAPE = {
    "possession": {"possession": 16, "passing": 14, "creativity": 10, "tempo": -8, "width": -6, "crossing": -6},
    "counterattack": {"counterattack": 20, "tempo": 14, "possession": -14, "creativity": -2, "pressing": -4},
    "highPress": {"pressing": 20, "defensiveIntensity": 12, "tempo": 12, "possession": -2},
    "direct": {"tempo": 8, "crossing": 8, "width": 6, "possession": -18, "creativity": -14, "passing": -10},
    "widePlay": {"crossing": 20, "width": 18, "creativity": 2, "possession": -6},
    "defensive": {"defensiveIntensity": 20, "possession": -14, "tempo": -10, "creativity": -14, "pressing": -8},
    "balanced": {},
}

# Which ratings exist beyond the three that decide a club's strength.
FLAVOUR_KEYS = [
    "possession", "passing", "tempo", "pressing", "width",
    "crossing", "counterattack", "creativity", "defensiveIntensity",
]

PALETTE = [
    "#e2574c", "#4aa3ff", "#f2c14e", "#6c7a89", "#2ecc71", "#9b59b6",
    "#e67e22", "#1abc9c", "#3d5a98", "#d35400", "#16a085", "#c0392b",
    "#8e44ad", "#7f8c8d", "#2c3e50", "#a04000",
]


def clamp(value, low=1, high=99):
    return max(low, min(high, int(round(value))))


def build_club(country, rank, entry, colour, rng):
    """
    Turn one authored club (name, short name, style) plus its rank in the
    league into a full set of ratings.

    `rank` is 0 for the strongest club in the country. Strength falls away from
    the country's ceiling, so the best club in a strong league is far better
    than the best club in a weak one — which is what makes moving country a
    step up or down rather than a change of scenery.
    """
    ceiling = country["ceiling"]
    floor = country["floor"]
    span = ceiling - floor
    # Slightly convex: the top two or three clubs pull away, as they do.
    share = (rank / 15) ** 1.25
    base = ceiling - span * share

    attack = clamp(base + rng.uniform(-3, 3))
    midfield = clamp(base + rng.uniform(-3, 3))
    defence = clamp(base + rng.uniform(-3, 3))

    ratings = {"attack": attack, "midfield": midfield, "defence": defence}
    shape = STYLE_SHAPE[entry["style"]]
    for key in FLAVOUR_KEYS:
        ratings[key] = clamp(base + shape.get(key, 0) + rng.uniform(-4, 4))

    return {
        "id": entry["id"],
        "name": entry["name"],
        "shortName": entry["short"],
        "style": entry["style"],
        "colour": colour,
        "base": clamp(base),
        "country": country["id"],
        "division": 1,
        "ratings": ratings,
    }


def build_keeper(club, rank, country, rng, name):
    """
    A keeper who belongs at his club. Better clubs keep better goalkeepers, so
    the one mechanic the whole game is built around — reading the keeper —
    genuinely gets harder as you climb.
    """
    ceiling = country["ceiling"]
    floor = country["floor"]
    base = ceiling - (ceiling - floor) * (rank / 15)

    def attr(offset=0, spread=5):
        return clamp(base + offset + rng.uniform(-spread, spread))

    return {
        "id": name["id"],
        "name": name["name"],
        "teamId": club["id"],
        "attributes": {
            "reflexes": attr(2),
            "positioning": attr(1),
            "anticipation": attr(),
            "oneOnOne": attr(),
            # Aggression is a personality, not a quality: a wild keeper at a
            # good club is a real and interesting thing to face.
            "aggression": clamp(rng.uniform(38, 82)),
            "decisionMaking": attr(),
            "handling": attr(1),
            "distribution": attr(-2),
        },
    }


# ------------------------------------------------------------ the world ---
#
# `ceiling` and `floor` are the strength of a country's best and worst club.
# They are what makes a league a LEVEL rather than a label: the best club in
# Scotland is weaker than the eighth-best in England, so moving country is a
# real step in one direction or the other.
#
# `prestige` is how closely the football world watches, 0-1. It scales
# reputation, wages and international selection, and it is deliberately not the
# same thing as strength — a league can be well watched and mediocre.

COUNTRIES = [
    {"id": "england", "adjective": "English", "name": "England", "league": "The Premier Division",
     "short": "ENG", "confederation": "europe", "prestige": 1.0, "ceiling": 86, "floor": 40},
    {"id": "spain", "adjective": "Spanish", "name": "Spain", "league": "La Liga Nacional",
     "short": "ESP", "confederation": "europe", "prestige": 0.96, "ceiling": 87, "floor": 42},
    {"id": "germany", "adjective": "German", "name": "Germany", "league": "Die Bundesliga",
     "short": "GER", "confederation": "europe", "prestige": 0.92, "ceiling": 85, "floor": 44},
    {"id": "italy", "adjective": "Italian", "name": "Italy", "league": "Serie Alta",
     "short": "ITA", "confederation": "europe", "prestige": 0.9, "ceiling": 84, "floor": 41},
    {"id": "france", "adjective": "French", "name": "France", "league": "Le Championnat",
     "short": "FRA", "confederation": "europe", "prestige": 0.8, "ceiling": 82, "floor": 38},
    {"id": "turkey", "adjective": "Turkish", "name": "Turkey", "league": "The Super Group",
     "short": "TUR", "confederation": "europe", "prestige": 0.72, "ceiling": 79, "floor": 35},
    {"id": "portugal", "adjective": "Portuguese", "name": "Portugal", "league": "A Liga Principal",
     "short": "POR", "confederation": "europe", "prestige": 0.68, "ceiling": 78, "floor": 34},
    {"id": "netherlands", "adjective": "Dutch", "name": "Netherlands", "league": "De Eredivisie",
     "short": "NED", "confederation": "europe", "prestige": 0.66, "ceiling": 76, "floor": 33},
    {"id": "belgium", "adjective": "Belgian", "name": "Belgium", "league": "De Ereklasse",
     "short": "BEL", "confederation": "europe", "prestige": 0.62, "ceiling": 74, "floor": 31},
    {"id": "greece", "adjective": "Greek", "name": "Greece", "league": "The Alpha Division",
     "short": "GRE", "confederation": "europe", "prestige": 0.56, "ceiling": 73, "floor": 30},
    {"id": "scotland", "adjective": "Scottish", "name": "Scotland", "league": "The Premiership",
     "short": "SCO", "confederation": "europe", "prestige": 0.5, "ceiling": 72, "floor": 28},
    {"id": "austria", "adjective": "Austrian", "name": "Austria", "league": "Die Erste Klasse",
     "short": "AUT", "confederation": "europe", "prestige": 0.46, "ceiling": 70, "floor": 27},
]


# --------------------------------------------------------------- nations ---
#
# COUNTRIES WITH NO LEAGUE.
#
# A national side is normally DERIVED — built from its country's five strongest
# clubs and lifted by the country's depth — which is why it needs no roster and
# drifts as its clubs drift. A country with no league has no clubs to derive
# from, so these carry an authored `strength` instead, and drift on their own
# (see core/career/nationDrift.ts).
#
# They exist so the World Cup is a world cup. None of them has a league yet, so
# a player from one of them plays his club football in Europe and his
# international football for home, which is a real football career and a more
# interesting one than the alternative.
#
# `prestige` is still how closely the football world watches. It is NOT strength:
# a country can be watched everywhere and mediocre.
#
# STRENGTH IS CALIBRATED AGAINST THE DERIVED SIDES, because the two have to meet
# in the same tournament. A derived nation is its best club lifted by its
# country's depth — Spain comes out at 0.977 of the scale and Austria, the
# twelfth European league, at 0.813. The first numbers written here were the
# strength a national side "felt" like in isolation, and they put ten of the
# twelve European sides above every nation outside Europe: a World Cup would
# have been a European procession with Brazil in it. These are set so the two
# halves of the world interleave.

def nation(id, name, adjective, short, confederation, prestige, strength, style, colour):
    return {"id": id, "name": name, "adjective": adjective, "short": short,
            "confederation": confederation, "prestige": prestige,
            "nationalStrength": strength, "style": style, "colour": colour}


NATIONS = [
    # Europe, without leagues of their own. Twelve European countries have
    # leagues and four do not, which makes Europe sixteen nations — the size of
    # every world tier and of Europe's own championship.
    nation("croatia", "Croatia", "Croatian", "CRO", "europe", 0.58, 80, "possession", "#ff0000"),
    nation("poland", "Poland", "Polish", "POL", "europe", 0.56, 78, "direct", "#dc143c"),
    nation("serbia", "Serbia", "Serbian", "SRB", "europe", 0.52, 77, "counterattack", "#c6363c"),
    nation("sweden", "Sweden", "Swedish", "SWE", "europe", 0.52, 76, "highPress", "#006aa7"),
    # South America
    nation("brazil", "Brazil", "Brazilian", "BRA", "southAmerica", 0.94, 93, "possession", "#f7d117"),
    nation("argentina", "Argentina", "Argentine", "ARG", "southAmerica", 0.92, 92, "counterattack", "#75aadb"),
    nation("uruguay", "Uruguay", "Uruguayan", "URU", "southAmerica", 0.70, 84, "defensive", "#5b9bd5"),
    nation("colombia", "Colombia", "Colombian", "COL", "southAmerica", 0.68, 82, "widePlay", "#fcd116"),
    nation("chile", "Chile", "Chilean", "CHI", "southAmerica", 0.62, 79, "highPress", "#d52b1e"),
    nation("peru", "Peru", "Peruvian", "PER", "southAmerica", 0.54, 74, "balanced", "#d91023"),
    nation("paraguay", "Paraguay", "Paraguayan", "PAR", "southAmerica", 0.50, 72, "defensive", "#0038a8"),
    nation("ecuador", "Ecuador", "Ecuadorean", "ECU", "southAmerica", 0.50, 73, "direct", "#ffd100"),
    # Africa
    nation("nigeria", "Nigeria", "Nigerian", "NGA", "africa", 0.62, 81, "direct", "#008751"),
    nation("senegal", "Senegal", "Senegalese", "SEN", "africa", 0.60, 82, "highPress", "#00853f"),
    nation("morocco", "Morocco", "Moroccan", "MAR", "africa", 0.62, 83, "possession", "#c1272d"),
    nation("egypt", "Egypt", "Egyptian", "EGY", "africa", 0.56, 78, "counterattack", "#ce1126"),
    nation("ghana", "Ghana", "Ghanaian", "GHA", "africa", 0.54, 77, "direct", "#006b3f"),
    nation("cameroon", "Cameroon", "Cameroonian", "CMR", "africa", 0.52, 76, "widePlay", "#007a5e"),
    nation("ivory-coast", "Ivory Coast", "Ivorian", "CIV", "africa", 0.54, 78, "balanced", "#f77f00"),
    nation("algeria", "Algeria", "Algerian", "ALG", "africa", 0.52, 77, "possession", "#006233"),
    # Asia
    nation("japan", "Japan", "Japanese", "JPN", "asia", 0.66, 81, "possession", "#bc002d"),
    nation("south-korea", "South Korea", "Korean", "KOR", "asia", 0.62, 79, "highPress", "#0047a0"),
    nation("iran", "Iran", "Iranian", "IRN", "asia", 0.54, 76, "defensive", "#239f40"),
    nation("australia", "Australia", "Australian", "AUS", "asia", 0.56, 76, "direct", "#00843d"),
    nation("saudi-arabia", "Saudi Arabia", "Saudi", "KSA", "asia", 0.52, 72, "counterattack", "#165d31"),
    nation("qatar", "Qatar", "Qatari", "QAT", "asia", 0.44, 69, "possession", "#8a1538"),
    nation("iraq", "Iraq", "Iraqi", "IRQ", "asia", 0.42, 68, "balanced", "#ce1126"),
    nation("uzbekistan", "Uzbekistan", "Uzbek", "UZB", "asia", 0.40, 69, "direct", "#1eb53a"),
    # North and Central America
    nation("mexico", "Mexico", "Mexican", "MEX", "northAmerica", 0.68, 81, "widePlay", "#006847"),
    nation("united-states", "United States", "American", "USA", "northAmerica", 0.66, 80, "highPress", "#3c3b6e"),
    nation("costa-rica", "Costa Rica", "Costa Rican", "CRC", "northAmerica", 0.48, 71, "defensive", "#002b7f"),
    nation("canada", "Canada", "Canadian", "CAN", "northAmerica", 0.50, 73, "counterattack", "#d80621"),
    nation("honduras", "Honduras", "Honduran", "HON", "northAmerica", 0.40, 67, "direct", "#0073cf"),
    nation("jamaica", "Jamaica", "Jamaican", "JAM", "northAmerica", 0.40, 68, "counterattack", "#009b3a"),
    nation("panama", "Panama", "Panamanian", "PAN", "northAmerica", 0.38, 66, "balanced", "#005293"),
    nation("el-salvador", "El Salvador", "Salvadorean", "SLV", "northAmerica", 0.36, 64, "defensive", "#0f47af"),
]


def club(id, name, short, style):
    return {"id": id, "name": name, "short": short, "style": style}


# Every club below is invented. Strongest first — rank in this list IS the
# club's standing in its league.
CLUBS = {
    "spain": [
        club("real-valmorena", "Real Valmorena", "RVM", "possession"),
        club("atletico-sarraluz", "Atlético Sarraluz", "ASL", "highPress"),
        club("cd-penaverde", "CD Peñaverde", "PEN", "possession"),
        club("almedina-cf", "Almedina CF", "ALM", "counterattack"),
        club("racing-costaleja", "Racing Costaleja", "RCO", "widePlay"),
        club("ud-montebravo", "UD Montebravo", "MBV", "defensive"),
        club("cf-herrandiz", "CF Herrándiz", "HRZ", "direct"),
        club("deportivo-olmedo", "Deportivo Olmedo", "OLM", "balanced"),
        club("club-espinela", "Club Espinela", "ESN", "possession"),
        club("rayo-turdana", "Rayo Turdana", "TUR", "counterattack"),
        club("cd-marbellon", "CD Marbellón", "MBL", "widePlay"),
        club("atletico-villacruz", "Atlético Villacruz", "AVC", "highPress"),
        club("ud-canadilla", "UD Cañadilla", "CAD", "defensive"),
        club("sd-ferrolina", "SD Ferrolina", "FRL", "balanced"),
        club("cf-puentelar", "CF Puentelar", "PTL", "direct"),
        club("club-aldeanova", "Club Aldeanova", "ALD", "counterattack"),
    ],
    "germany": [
        club("fc-rheinstadt", "FC Rheinstadt", "RHS", "highPress"),
        club("borussia-aldenberg", "Borussia Aldenberg", "ALB", "counterattack"),
        club("sv-weissbrunn", "SV Weissbrunn", "WBR", "possession"),
        club("vfb-kranzhelm", "VfB Kranzhelm", "KRZ", "direct"),
        club("eintracht-osterloh", "Eintracht Osterloh", "EOS", "balanced"),
        club("fc-nordhaven", "FC Nordhaven", "NDH", "widePlay"),
        club("tsv-grunwalde", "TSV Grünwalde", "GRW", "defensive"),
        club("sv-marburgen", "SV Marburgen", "MBG", "highPress"),
        club("fc-steinbach-sud", "FC Steinbach Süd", "STB", "possession"),
        club("hansa-lubbenau", "Hansa Lübbenau", "HLB", "counterattack"),
        club("vfl-dornheim", "VfL Dornheim", "DRN", "balanced"),
        club("fc-altenfeld", "FC Altenfeld", "ALF", "direct"),
        club("sc-rabenstein", "SC Rabenstein", "RBN", "defensive"),
        club("fc-wendelsee", "FC Wendelsee", "WDS", "widePlay"),
        club("tsg-hohenmark", "TSG Hohenmark", "HHM", "highPress"),
        club("sv-elbtaler", "SV Elbtaler", "ELB", "balanced"),
    ],
    "italy": [
        club("ac-verdenza", "AC Verdenza", "VRD", "possession"),
        club("us-torrenova", "US Torrenova", "TRN", "defensive"),
        club("calcio-ferrandi", "Calcio Ferrandi", "FER", "possession"),
        club("as-montalbano", "AS Montalbano", "MTB", "counterattack"),
        club("ss-corvara", "SS Corvara", "CRV", "highPress"),
        club("ac-palmirano", "AC Palmirano", "PAL", "balanced"),
        club("us-sanremonte", "US Sanremonte", "SRM", "widePlay"),
        club("calcio-vestrella", "Calcio Vestrella", "VST", "direct"),
        club("ac-bruzzano", "AC Bruzzano", "BRZ", "defensive"),
        club("delfino-marecchia", "Delfino Marecchia", "MRC", "counterattack"),
        club("us-gallarate-nuovo", "US Gallarate Nuovo", "GLN", "balanced"),
        club("ac-trevisola", "AC Trevisola", "TVS", "possession"),
        club("calcio-ostiense", "Calcio Ostiense", "OSN", "highPress"),
        club("ss-falcorno", "SS Falcorno", "FLC", "direct"),
        club("ac-numanza", "AC Numanza", "NUM", "widePlay"),
        club("us-caltavera", "US Caltavera", "CLT", "defensive"),
    ],
    "france": [
        club("olympique-valcourt", "Olympique Valcourt", "OVC", "possession"),
        club("racing-saint-amiel", "Racing Saint-Amiel", "RSA", "highPress"),
        club("stade-rochambault", "Stade Rochambault", "SRB", "widePlay"),
        club("as-montfleury", "AS Montfleury", "MFL", "counterattack"),
        club("fc-beauvron", "FC Beauvron", "BVR", "balanced"),
        club("olympique-carcasson", "Olympique Carcasson", "OCS", "defensive"),
        club("rc-lensauve", "RC Lensauve", "LSV", "direct"),
        club("stade-ambrelac", "Stade Ambrelac", "AMB", "possession"),
        club("fc-vireloup", "FC Vireloup", "VRL", "counterattack"),
        club("as-trelancourt", "AS Trélancourt", "TRL", "widePlay"),
        club("us-chantevigne", "US Chantevigne", "CHV", "balanced"),
        club("fc-sarlanges", "FC Sarlanges", "SRL", "highPress"),
        club("olympique-ferrandel", "Olympique Ferrandel", "OFR", "direct"),
        club("stade-noirmoutin", "Stade Noirmoutin", "NRM", "defensive"),
        club("as-puymarais", "AS Puymarais", "PYM", "counterattack"),
        club("fc-loriveau", "FC Loriveau", "LRV", "balanced"),
    ],
    "portugal": [
        club("sporting-alvorada", "Sporting Alvorada", "ALV", "possession"),
        club("cf-estrelinha", "CF Estrelinha", "ETL", "counterattack"),
        club("fc-douravela", "FC Douravela", "DVL", "highPress"),
        club("academica-ribamonte", "Académica Ribamonte", "RBM", "balanced"),
        club("vitoria-serranova", "Vitória Serranova", "SRN", "widePlay"),
        club("cd-marimbelo", "CD Marimbelo", "MRI", "defensive"),
        club("sc-cavalonga", "SC Cavalonga", "CVL", "direct"),
        club("fc-penamouro", "FC Penamouro", "PNM", "possession"),
        club("cd-belaflor", "CD Belaflor", "BLF", "counterattack"),
        club("sc-torrezinho", "SC Torrezinho", "TRZ", "balanced"),
        club("fc-vilarouca", "FC Vilarouca", "VLR", "widePlay"),
        club("cd-aguadela", "CD Aguadela", "AGD", "defensive"),
        club("sc-montijano", "SC Montijano", "MTJ", "highPress"),
        club("fc-carvalhosa-nova", "FC Carvalhosa Nova", "CVN", "direct"),
        club("cd-praiolinda", "CD Praiolinda", "PRL", "possession"),
        club("sc-regonde", "SC Regonde", "RGD", "balanced"),
    ],
    "netherlands": [
        club("afc-zandvoorde", "AFC Zandvoorde", "ZVD", "possession"),
        club("fc-veldhoorn", "FC Veldhoorn", "VLH", "highPress"),
        club("sc-maasrode", "SC Maasrode", "MSR", "direct"),
        club("fc-rijnvelde", "FC Rijnvelde", "RJV", "possession"),
        club("sc-kaaphuizen", "SC Kaaphuizen", "KPH", "counterattack"),
        club("fc-gelderveen", "FC Gelderveen", "GLV", "balanced"),
        club("sc-duinbergen", "SC Duinbergen", "DNB", "widePlay"),
        club("fc-noorderbrug", "FC Noorderbrug", "NBR", "defensive"),
        club("afc-steenwoude", "AFC Steenwoude", "STW", "highPress"),
        club("sc-haverlingen", "SC Haverlingen", "HVL", "balanced"),
        club("fc-zwartemeer", "FC Zwartemeer", "ZWM", "counterattack"),
        club("vv-oosterhaven", "VV Oosterhaven", "OHV", "direct"),
        club("sc-bergendaal", "SC Bergendaal", "BGD", "possession"),
        club("fc-lindenhorst", "FC Lindenhorst", "LDH", "widePlay"),
        club("afc-weststrand", "AFC Weststrand", "WST", "defensive"),
        club("sc-doornveld", "SC Doornveld", "DRV", "balanced"),
    ],
    "scotland": [
        club("kilbrannan-athletic", "Kilbrannan Athletic", "KBA", "highPress"),
        club("glenmorra-rangers", "Glenmorra Rangers", "GMR", "counterattack"),
        club("auchterlonie-united", "Auchterlonie United", "AUU", "balanced"),
        club("craigmarnock-thistle", "Craigmarnock Thistle", "CMT", "widePlay"),
        club("dunbarrow-city", "Dunbarrow City", "DBC", "possession"),
        club("inverlochy-athletic", "Inverlochy Athletic", "IVA", "direct"),
        club("strathaven-rovers", "Strathaven Rovers", "SVR", "defensive"),
        club("balnagowan-fc", "Balnagowan FC", "BLG", "balanced"),
        club("kirkhaven-united", "Kirkhaven United", "KHU", "counterattack"),
        club("lochranza-thistle", "Lochranza Thistle", "LRT", "widePlay"),
        club("fettercairn-city", "Fettercairn City", "FTC", "possession"),
        club("ardnavaig-fc", "Ardnavaig FC", "ADV", "highPress"),
        club("tarbolton-rovers", "Tarbolton Rovers", "TBR", "direct"),
        club("muirbrae-athletic", "Muirbrae Athletic", "MBA", "defensive"),
        club("carrickbane-united", "Carrickbane United", "CKB", "balanced"),
        club("drumnaveigh-thistle", "Drumnaveigh Thistle", "DNT", "counterattack"),
    ],
    "turkey": [
        club("besiktepe-sk", "Beşiktepe SK", "BST", "highPress"),
        club("karadeniz-spor", "Karadeniz Spor", "KDZ", "counterattack"),
        club("yildizhan-fk", "Yıldızhan FK", "YLD", "possession"),
        club("anadolu-gencler", "Anadolu Gençler", "ANG", "direct"),
        club("bogazkent-sk", "Boğazkent SK", "BGK", "widePlay"),
        club("selimoglu-spor", "Selimoğlu Spor", "SLM", "balanced"),
        club("demirkale-fk", "Demirkale FK", "DMK", "defensive"),
        club("altinsu-spor", "Altınsu Spor", "ALT", "counterattack"),
        club("marmarahisar-sk", "Marmarahisar SK", "MRH", "possession"),
        club("cinarkoy-fk", "Çınarköy FK", "CNK", "highPress"),
        club("goksudere-spor", "Göksudere Spor", "GKS", "direct"),
        club("kayalidag-sk", "Kayalıdağ SK", "KYD", "widePlay"),
        club("ege-firtinasi", "Ege Fırtınası", "EGF", "balanced"),
        club("tuzlabeyi-fk", "Tuzlabeyi FK", "TZB", "defensive"),
        club("harmanlik-spor", "Harmanlık Spor", "HRM", "counterattack"),
        club("serindere-sk", "Serindere SK", "SRD", "balanced"),
    ],
    "belgium": [
        club("rsc-vaelbeke", "RSC Vaelbeke", "VAE", "possession"),
        club("kv-doornhout", "KV Doornhout", "DHT", "highPress"),
        club("standaard-liegny", "Standaard Liegny", "SLG", "counterattack"),
        club("kaa-merksfoort", "KAA Merksfoort", "MKF", "widePlay"),
        club("rfc-hesbaville", "RFC Hesbaville", "HSB", "direct"),
        club("sk-westerlinde", "SK Westerlinde", "WSL", "balanced"),
        club("kvc-zandbergen", "KVC Zandbergen", "ZND", "defensive"),
        club("rc-namuroise", "RC Namuroise", "NMR", "possession"),
        club("kfc-oostkamp", "KFC Oostkamp", "OKP", "counterattack"),
        club("union-verlaine", "Union Verlaine", "UVL", "widePlay"),
        club("kvv-turnhoven", "KVV Turnhoven", "TRH", "highPress"),
        club("cs-borinage", "CS Borinage", "BRG", "direct"),
        club("ksv-maldegheim", "KSV Maldegheim", "MLD", "defensive"),
        club("rrc-thuinois", "RRC Thuinois", "THN", "balanced"),
        club("kfc-lenniksveld", "KFC Lenniksveld", "LNV", "counterattack"),
        club("sk-eeklode", "SK Eeklode", "EKL", "possession"),
    ],
    "greece": [
        club("pae-kalithros", "PAE Kalithros", "KLT", "possession"),
        club("aetos-larimna", "Aetos Larimna", "AET", "counterattack"),
        club("thermaikos-fc", "Thermaikos FC", "THM", "highPress"),
        club("pandoros-athinon", "Pandoros Athinon", "PDA", "direct"),
        club("kentavros-veria", "Kentavros Veria", "KNV", "widePlay"),
        club("egaleos-pyrgos", "Egaleos Pyrgos", "EGP", "balanced"),
        club("apollonias-kos", "Apollonias Kos", "APK", "defensive"),
        club("makedonikos-fc", "Makedonikos FC", "MKD", "counterattack"),
        club("ionikos-halandri", "Ionikos Halandri", "IHL", "possession"),
        club("kerkyraikos-fc", "Kerkyraikos FC", "KRK", "widePlay"),
        club("dorikos-messini", "Dorikos Messini", "DRM", "direct"),
        club("olympos-katerini", "Olympos Katerini", "OLK", "highPress"),
        club("achaikos-patron", "Achaikos Patron", "ACH", "defensive"),
        club("nafpaktia-fc", "Nafpaktia FC", "NFP", "balanced"),
        club("elpida-serron", "Elpida Serron", "ELS", "counterattack"),
        club("kymi-evias", "Kymi Evias", "KYM", "balanced"),
    ],
    "austria": [
        club("sk-hochstein", "SK Hochstein", "HCH", "highPress"),
        club("fc-wolkenau", "FC Wolkenau", "WLK", "possession"),
        club("austria-lindenthal", "Austria Lindenthal", "LDT", "counterattack"),
        club("sv-marchegg", "SV Marchegg", "MGG", "direct"),
        club("wsg-tannbruck", "WSG Tannbruck", "TNB", "widePlay"),
        club("sk-ennsleithen", "SK Ennsleithen", "ENS", "balanced"),
        club("fc-kaltenbrunn", "FC Kaltenbrunn", "KBR", "defensive"),
        club("sv-ratzendorf", "SV Ratzendorf", "RTZ", "counterattack"),
        club("hohenau-wien", "Hohenau Wien", "HHW", "possession"),
        club("sk-purgstall", "SK Purgstall", "PRG", "widePlay"),
        club("fc-steyregg", "FC Steyregg", "STY", "highPress"),
        club("sv-oberfeld", "SV Oberfeld", "OBF", "direct"),
        club("sk-villachtal", "SK Villachtal", "VLT", "defensive"),
        club("fc-neusiedlbach", "FC Neusiedlbach", "NSB", "balanced"),
        club("sv-gramastetten", "SV Gramastetten", "GRM", "counterattack"),
        club("sk-mattersdorf", "SK Mattersdorf", "MTD", "balanced"),
    ],
}

KEEPERS = {
    "spain": ["Iker Belmonte", "Rubén Sagasti", "Álvaro Cendán", "Unai Berrocal",
              "Pau Miralles", "Sergio Ontiveros", "Diego Nájera", "Marc Puyalto",
              "Aitor Vilaseca", "Jorge Betancur", "Nacho Quintanar", "Hugo Estévanez",
              "Iván Colomer", "Adrián Mendizábal", "Bruno Solanas", "Óscar Rivadeneira"],
    "germany": ["Jonas Wieckmann", "Lukas Behrendt", "Finn Oberhauser", "Tobias Kranzler",
                "Marcel Sindelar", "Niklas Ehrhardt", "Jannik Rothmund", "Fabian Steinhoff",
                "Leon Vosskamp", "Moritz Ahlbrecht", "Kilian Reithmayer", "Sven Draxelbauer",
                "Philipp Nordmann", "Julian Sattler", "Timo Wendlandt", "Erik Haselbach"],
    "italy": ["Matteo Ferrucci", "Luca Bendinelli", "Andrea Sartorel", "Giacomo Vanzetti",
              "Davide Moretto", "Simone Carbonara", "Alessio Grimaldi", "Federico Ranieri",
              "Tommaso Pellizzari", "Nicolò Baratta", "Marco Vestrini", "Lorenzo Fanucci",
              "Stefano Mazzocchi", "Riccardo Trombetta", "Emanuele Sacchetti", "Gabriele Orlandini"],
    "france": ["Théo Marchandin", "Lucas Béranger", "Hugo Delacourt", "Antoine Rivière",
               "Maxime Coulombier", "Baptiste Feuillard", "Nathan Vaugrenard", "Rémi Chassagne",
               "Yanis Delaporte", "Enzo Marbeuf", "Clément Sarazin", "Léo Vandanjon",
               "Mathis Coudray", "Alexandre Peyrolles", "Gaëtan Mourdon", "Noé Trévidic"],
    "portugal": ["Rui Palminha", "Diogo Espargosa", "Tiago Mourinhal", "André Vasconcelos",
                 "Nuno Cardadeiro", "Bruno Salgadinho", "Miguel Estorninho", "Ricardo Beltrão",
                 "João Vilarinho", "Pedro Sacramento", "Gonçalo Amoedo", "Fábio Loureiro",
                 "Rafael Sobreiro", "Hélder Manteigas", "Vítor Canedo", "Sérgio Bandarra"],
    "netherlands": ["Sander Vroomshoek", "Bram Kettelaar", "Joris van Duinen", "Thijs Oosterlinck",
                    "Daan Verhoeven", "Ruben Haaksma", "Stijn Bloemendaal", "Niels Vreeswijk",
                    "Jelle Rietkerk", "Koen Aaldering", "Sem van Ravenstein", "Bas Terhorst",
                    "Lars Duinkerken", "Tim Grootveld", "Mees Broekhuizen", "Wout Schaminee"],
    "scotland": ["Callum Rennieson", "Euan Fairbairn", "Struan Halcrow", "Rory McAlpine",
                 "Fraser Dunwoodie", "Kieran Lauchlan", "Blair Cattanach", "Angus Murchison",
                 "Ewan Strachan", "Douglas Kilgour", "Innes MacRitchie", "Grant Fyvie",
                 "Lewis Tannahill", "Cameron Braidwood", "Murray Kinnaird", "Ross Auchinleck"],
    "turkey": ["Emre Sarıkaya", "Kerem Doğanay", "Barış Üstündağ", "Onur Beyazıt",
               "Serkan Alptekin", "Yusuf Kandemir", "Mert Özdilek", "Halil Turgutlu",
               "Burak Şenyurt", "Cem Karaduman", "Efe Balcıoğlu", "Ozan Demirtaş",
               "Tolga Ergüven", "Kaan Yıldıray", "Uğur Melikoğlu", "Deniz Akbulut"],
    "belgium": ["Wouter Claessens", "Thibaut Vermeersch", "Jonas Delcroix", "Maarten Buysse",
                "Nils Vandewalle", "Arne Steegmans", "Robbe Dekempeneer", "Simon Lauwereys",
                "Kobe Verhulst", "Gilles Maertens", "Senne Vanoverbeke", "Lander Coppens",
                "Milan Segers", "Aaron Debusschere", "Vincent Cauwenberghs", "Ruben Dhaenens"],
    "greece": ["Nikos Stavrianos", "Dimitris Kalogeras", "Yiannis Petrakos", "Vasilis Anagnostou",
               "Kostas Fragoulis", "Stelios Manolopoulos", "Christos Vergados", "Alexis Roumeliotis",
               "Panagiotis Drosakis", "Thanasis Kolovos", "Michalis Varvaressos", "Giorgos Tselios",
               "Sotiris Kanellakis", "Lefteris Mparoutsos", "Andreas Zafeiriou", "Manolis Tsirigotis"],
    "austria": ["Lukas Hinterberger", "Florian Grubmüller", "Matthias Puchleitner", "Dominik Ehrenfels",
                "Stefan Radlmayr", "Christoph Windisch", "Manuel Trattnig", "Patrick Auerböck",
                "Fabian Zwettler", "Sebastian Neuwirth", "Andreas Pilzbacher", "Daniel Hoflehner",
                "Michael Wolkersdorfer", "Simon Gattringer", "Thomas Riedlsperger", "Bernhard Kollmann"],
}


def slug(name):
    out = []
    for ch in name.lower():
        if ch.isalnum():
            out.append(ch)
        elif out and out[-1] != "-":
            out.append("-")
    return "".join(out).strip("-")


ACCENTS = str.maketrans(
    "áàâäãéèêëíìîïóòôöõúùûüñçÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇ",
    "aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC",
)


def main():
    teams = json.load(open("src/data/teams.json"))
    keepers = json.load(open("src/data/goalkeepers.json"))

    # Re-runnable: drop everything this script generated last time, so the file
    # is rebuilt rather than appended to. Only the authored English clubs and
    # their keepers survive between runs.
    generated = {c["id"] for c in COUNTRIES if c["id"] != "england"}
    kept_clubs = [t for t in teams if t.get("country", "england") not in generated]
    kept_ids = {t["id"] for t in kept_clubs}
    teams = kept_clubs
    keepers = [k for k in keepers if k["teamId"] in kept_ids]

    # The sixteen existing clubs become England's league, keeping their authored
    # ratings and — crucially — their ids, so saves in progress still resolve.
    for team in teams:
        team["country"] = "england"
        team["division"] = 1
    for keeper in keepers:
        keeper.setdefault("id", slug(keeper["name"]))

    used_ids = {t["id"] for t in teams}
    used_keeper_ids = {k["id"] for k in keepers}

    for country in COUNTRIES:
        if country["id"] == "england":
            continue
        entries = CLUBS[country["id"]]
        names = KEEPERS[country["id"]]
        assert len(entries) == 16, country["id"]
        assert len(names) == 16, country["id"]

        rng = random.Random(f"footii:{country['id']}")
        for rank, entry in enumerate(entries):
            assert entry["id"] not in used_ids, entry["id"]
            used_ids.add(entry["id"])
            new_club = build_club(country, rank, entry, PALETTE[rank % len(PALETTE)], rng)
            teams.append(new_club)

            keeper_id = slug(names[rank].translate(ACCENTS))
            assert keeper_id not in used_keeper_ids, keeper_id
            used_keeper_ids.add(keeper_id)
            keepers.append(
                build_keeper(new_club, rank, country, rng, {"id": keeper_id, "name": names[rank]})
            )

    countries = [
        {k: c[k] for k in ("id", "name", "adjective", "league", "short", "confederation", "prestige")}
        for c in COUNTRIES
    ] + NATIONS

    # Ids, short names and confederations all have to be sound across the whole
    # world, not just the part of it that has leagues.
    ids = [c["id"] for c in countries]
    assert len(set(ids)) == len(ids), "duplicate country ids"
    shorts = [c["short"] for c in countries]
    assert len(set(shorts)) == len(shorts), "duplicate country short names"
    # Every confederation runs the same eight-nation championship, so every
    # confederation needs at least eight nations in it.
    by_confederation = {}
    for c in countries:
        by_confederation.setdefault(c["confederation"], []).append(c)
    # Every confederation runs a championship of eight or sixteen, and the world
    # tiers are sixteen apiece, so the total has to divide into thirds.
    for confederation, members in sorted(by_confederation.items()):
        assert len(members) in (8, 16), f"{confederation} has {len(members)} nations"
    assert len(countries) % 16 == 0, f"{len(countries)} nations does not divide into tiers of 16"

    with open("src/data/teams.json", "w") as f:
        json.dump(teams, f, indent=2, ensure_ascii=False)
        f.write("\n")
    with open("src/data/goalkeepers.json", "w") as f:
        json.dump(keepers, f, indent=2, ensure_ascii=False)
        f.write("\n")
    with open("src/data/countries.json", "w") as f:
        json.dump(countries, f, indent=2, ensure_ascii=False)
        f.write("\n")

    # A short name is what a table, a chip and a transfer button show, so two
    # clubs sharing one reads as a bug wherever they appear together — and with
    # twelve leagues in one European draw, they appear together often.
    shorts = [t["shortName"] for t in teams]
    duplicates = sorted({s for s in shorts if shorts.count(s) > 1})
    assert not duplicates, f"duplicate short names: {duplicates}"

    print(f"{len(teams)} clubs, {len(keepers)} keepers, {len(countries)} countries")
    for c in COUNTRIES:
        n = len([t for t in teams if t["country"] == c["id"]])
        best = max((t for t in teams if t["country"] == c["id"]), key=lambda t: t["base"])
        worst = min((t for t in teams if t["country"] == c["id"]), key=lambda t: t["base"])
        print(f"  {c['short']} {n:>3} clubs  best {best['base']:>2} ({best['shortName']})  worst {worst['base']:>2}")


if __name__ == "__main__":
    main()
