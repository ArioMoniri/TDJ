#!/usr/bin/env python3
"""Build the TDJ catalogue index from the source spreadsheets.

Sources (data/sources):
  * Listado_Total_de_canciones_Filtrado.xls  — ~21.9k recordings (title, rhythm, singer, year, orchestra, date, CD, notes)
  * All_orchestras.xls                       — orchestra x year quality heatmap (cell colours) + archive counts

Outputs (data/index):
  songs.json, orchestras.json, singers.json, coverage.json, meta.json

Run:  python3 scripts/build_index.py            (requires: pip install xlrd)
The index is committed to the repo; re-run after editing the sources or run `pnpm index:update`.
"""
from __future__ import annotations
import json, re, sys, hashlib, unicodedata, datetime, collections, pathlib
try:
    import xlrd
except ImportError:
    sys.exit("pip install xlrd")

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "sources"
OUT = ROOT / "data" / "index"
OUT.mkdir(parents=True, exist_ok=True)

RHYTHM_MAP = {
    "T": "tango", "V": "vals", "M": "milonga", "CA": "cancion", "FT": "foxtrot", "PA": "pasodoble",
    "RA": "ranchera", "Z": "zamba", "E": "estilo", "CO": "corrido", "TO": "tonada", "PO": "polca",
    "PL": "polca", "CD": "candombe", "B": "bolero", "R": "rumba", "C": "chacarera", "S": "shimmy",
    "SH": "shimmy", "F": "fox", "MA": "marcha", "H": "habanera", "TA": "tango", "VA": "vals", "MI": "milonga",
}
GOLDEN_ORCH = {  # canonical names used by the engine
    "JUAN D'ARIENZO": "Juan D'Arienzo", "CARLOS DI SARLI": "Carlos Di Sarli", "ANÍBAL TROILO": "Aníbal Troilo",
    "OSVALDO PUGLIESE": "Osvaldo Pugliese", "MIGUEL CALÓ": "Miguel Caló", "RICARDO TANTURI": "Ricardo Tanturi",
    "RODOLFO BIAGI": "Rodolfo Biagi", "ENRIQUE RODRÍGUEZ": "Enrique Rodríguez", "FRANCISCO CANARO": "Francisco Canaro",
    "OSVALDO FRESEDO": "Osvaldo Fresedo", "EDGARDO DONATO": "Edgardo Donato", "ANGEL D'AGOSTINO": "Ángel D'Agostino",
    "ALFREDO DE ÁNGELIS": "Alfredo De Angelis", "PEDRO LAURENZ": "Pedro Laurenz", "LUCIO DEMARE": "Lucio Demare",
    "FRANCISCO LOMUTO": "Francisco Lomuto", "ROBERTO FIRPO": "Roberto Firpo", "ORQ.TÍPICA VÍCTOR": "Orquesta Típica Víctor",
    "ALFREDO GOBBI": "Alfredo Gobbi", "RICARDO MALERBA": "Ricardo Malerba", "DOMINGO FEDERICO": "Domingo Federico",
    "HÉCTOR VARELA": "Héctor Varela", "FULVIO SALAMANCA": "Fulvio Salamanca", "OSMAR MADERNA": "Osmar Maderna",
    "E.M.FRANCINI-A.PONTIER": "Francini-Pontier", "FLORINDO SASSONE": "Florindo Sassone", "JOSÉ BASSO": "José Basso",
    "DONATO RACCIATTI": "Donato Racciatti", "ASTOR PIAZZOLLA": "Astor Piazzolla", "HORACIO SALGÁN": "Horacio Salgán",
    "ARMANDO PONTIER": "Armando Pontier", "JULIO DE CARO": "Julio De Caro", "JUAN SÁNCHEZ GORIO": "Juan Sánchez Gorio",
    "PEDRO MAFFIA": "Pedro Maffia", "JORGE ARDUH": "Jorge Arduh", "LEOPOLDO FEDERICO": "Leopoldo Federico",
    "FRANCISCO ROTUNDO": "Francisco Rotundo", "JUAN MAGLIO \"PACHO\"": "Juan Maglio \"Pacho\"", "JORGE DRAGONE": "Jorge Dragone",
    "VÍCTOR D'AMARIO": "Víctor D'Amario", "PORFIRIO DÍAZ": "Porfirio Díaz", "ORQUESTA FERNÁNDEZ FIERRO": "Orquesta Típica Fernández Fierro",
    "SEXTETO MAYOR": "Sexteto Mayor", "COLOR TANGO": "Color Tango", "ORQUESTA TÍPICA VÍCTOR": "Orquesta Típica Víctor",
}

def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def titlecase(s: str) -> str:
    s = " ".join(s.split())
    small = {"de", "del", "la", "el", "los", "las", "y", "a", "en", "con", "por", "para", "un", "una", "al", "lo", "mi", "tu", "su", "sin", "que"}
    words = s.lower().split(" ")
    out = []
    for i, w in enumerate(words):
        if i and w in small:
            out.append(w)
        else:
            out.append("-".join(p[:1].upper() + p[1:] for p in w.split("-")))
    t = " ".join(out)
    t = re.sub(r"\bD'(\w)", lambda m: "D'" + m.group(1).upper(), t)
    return t

def singercase(raw: str) -> str:
    """Singer strings: abbreviated/duet/nickname forms in the source are written without spaces.
    "C.DANTE-O.LARROCA" -> "C. Dante - O. Larroca", 'ROBERTO"CHATO"FLORES' -> 'Roberto "Chato" Flores',
    "A.ARENAS-E.LUCERO" -> "A. Arenas - E. Lucero", "J.C.GODOY-R.MANCINI" -> "J. C. Godoy - R. Mancini"."""
    t = titlecase(raw)
    t = re.sub(r"\b([A-Za-zÀ-ÿ])\.(?=\S)", lambda m: m.group(1).upper() + ". ", t)          # "C.dante" -> "C. dante"
    t = re.sub(r'\s*"\s*([^"]+?)\s*"\s*', lambda m: ' "' + m.group(1).strip() + '" ', t)  # nickname quotes
    t = re.sub(r"\s*-\s*", " - ", t)                                                     # duets
    small = {"de", "del", "la", "el", "los", "las", "y", "e"}
    words = []
    for i, w in enumerate(t.split()):
        if i and w.lower() in small: words.append(w.lower()); continue
        m = re.match(r"^(\W*)(\w)(.*)$", w)
        words.append(m.group(1) + m.group(2).upper() + m.group(3) if m else w)
    return " ".join(words)

def norm_title(t: str) -> str:
    """Same normalisation as normTitle() in packages/core/src/energy.ts (used for override keys)."""
    t = unicodedata.normalize("NFKD", t)
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = re.sub(r"\(.*?\)", "", t)
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()

# Known rhythm mislabels in the source (docs/reviews/musician-review.md): normalised title -> rhythm,
# optionally restricted to one orchestra id (None = any orchestra).
RHYTHM_OVERRIDE = {
    ("pregonera", None): "vals",                        # De Angelis vals (Dante-Martel 1945); tagged tango in all copies
    ("flores del alma", None): "vals",
    ("sonar y nada mas", None): "vals",
    ("a magaldi", "alfredo-de-angelis"): "vals",
    ("con toda la voz que tengo", "anibal-troilo"): "tango",  # Troilo-Fiorentino 1941; one copy tagged milonga
    # round 13 (docs/reviews/round13-best-years.md §4.2)
    ("arrabal", "pedro-laurenz"): "tango",               # José Pascual's tango, Láurenz instrumental 1937-09-24 (tagged milonga)
    ("carnaval de mi barrio", "edgardo-donato"): "vals", # Lagos/Morales 1939-03-23: a vals (the profile's own signature)
}
# Curated singer fixes (round 8): (normalised title, orchestra id, year) -> singer (None = instrumental).
# Pugliese's 1959 La Cumparsita is the instrumental closing version; the source files it under a singers' compilation.
SINGER_OVERRIDE = {
    ("la cumparsita", "osvaldo-pugliese", 1959): None,
    # Láurenz "Amurado" Odeon 1940-07-29 is the instrumental every DJ plays (round 9, docs/specs/round9-engine.md §4):
    # the source carries the singer of the coupled side ("Improvisando", Casas). Casas left Láurenz in 1940; no later
    # Casas vocal of Amurado exists in the source, so the "1944 Casas vocal" the review asked about cannot be confirmed.
    ("amurado", "pedro-laurenz", 1940): None,
}
# Round 13 (round13-best-years.md §4.2): broken singer strings in the source, fixed after singercase()
SINGER_STRING_FIX = {"Juan Alessio(jorge Ortíz0": "Juan Alessio (Jorge Ortíz)"}
# Round 13 (§4.1): a range-dated row whose real recording date is known: (normalised title, orchestra id, singer) -> year
YEAR_OVERRIDE = {
    ("niebla del riachuelo", "osvaldo-fresedo", "Roberto Ray"): 1937,  # written for the 1937 film "La fuga"; the source says 1933/48
}
# Radio/live/acetate transcriptions and "inéditos" compilations: bootleg-grade sources a DJ never builds a tanda from.
TRANSCRIPTION_NOTE_RE = re.compile(r"IN[EÉ]DIT|TOMA\s*RADIO|TOMA\s*VIVO|EN\s*VIVO|\bVIVO\b|TOMA\s*TV|TOMA\s*BAILE|TOMAS?\s*Y\s*AC|AC\.-TOMA|ACETATO|ENTREVISTA", re.I)
TRANSCRIPTION_ALBUM_RE = re.compile(r"IN[EÉ]DIT|EN\s*VIVO|\bVIVO\b|EN\s*JAP[OÓ]N|ASAHIKAWA|ENTREVISTA|EMIS\.?\s*RADIAL|RADIO|ACETATO", re.I)
# Medleys / potpourris / "parte N" sides are indexed as tangos in the source; they are not dance tracks.
MEDLEY_RE = re.compile(r"^(selecc|seleccion|selecciones|potpourri|popurr|mosaico|fantasia)\b|\b(\d+a?\.? ?parte|parte \d)\b")
# Pseudo-singers: the "CANTA" column sometimes names a soloist/narrator instead of a vocalist.
PSEUDO_SINGER = [
    (re.compile(r"^s[oó]lo de piano", re.I), "solo piano"),
    (re.compile(r"^s[oó]lo de bandone[oó]n", re.I), "solo bandoneon"),
    (re.compile(r"^glosas\b", re.I), "glosas"),
    (re.compile(r"^recita(do)?\b", re.I), "recitado"),
]

def era_of(year):
    if year is None: return "unknown"
    if year < 1926: return "guardia-vieja"
    if year < 1935: return "guardia-nueva"
    if year < 1941: return "golden-early"      # 1935-1940 rhythmic revival
    if year < 1946: return "golden-peak"       # 1941-1945 the great singers
    if year < 1956: return "golden-late"       # 1946-1955 lush, dramatic
    if year < 1970: return "post-golden"
    if year < 1995: return "nuevo"
    return "contemporary"

def parse_year(yil, fecha, yil2):
    y = None
    if isinstance(yil, float) and yil > 1905: y = int(yil)
    if y is None and isinstance(fecha, float) and fecha > 0:
        if fecha < 3000: y = int(fecha)
        else:
            try: y = xlrd.xldate_as_datetime(fecha, 0).year
            except Exception: y = None
    if y is None and isinstance(fecha, str):
        m = re.match(r"(\d{4})", fecha.strip())
        if m: y = int(m.group(1))
    if y is None and isinstance(yil2, float) and yil2 > 1900: y = int(yil2)
    if y is not None and y > 2008: y -= 100   # typos like 2028 → 1928 (sheet last saved 2008)
    if y is not None and (y < 1900 or y > 2008): y = None
    return y

def parse_date(fecha):
    if isinstance(fecha, float) and fecha >= 3000:
        try:
            d = xlrd.xldate_as_datetime(fecha, 0).date()
            if d.year > 2008: d = d.replace(year=d.year - 100)
            return d.isoformat()
        except Exception: return None
    if isinstance(fecha, str) and fecha.strip(): return fecha.strip()
    return None

def build_songs():
    wb = xlrd.open_workbook(SRC / "Listado_Total_de_canciones_Filtrado.xls")
    sh = wb.sheet_by_index(0)
    songs, seen = [], set()
    for r in range(1, sh.nrows):
        row = sh.row_values(r)
        title = str(row[1]).strip()
        if not title: continue
        rcode = str(row[2]).strip().upper()
        rhythm = RHYTHM_MAP.get(rcode, "other" if rcode else "unknown")
        singer_raw = str(row[3]).strip()
        orch_raw = str(row[5]).strip()
        year = parse_year(row[4], row[6], row[11])
        singer_legacy = None if singer_raw.upper() in ("", "INSTRUMENTAL") else titlecase(singer_raw)  # kept only for the stable id hash
        singer = None if singer_legacy is None else singercase(singer_raw)
        note = None
        for rx, label in PSEUDO_SINGER:
            if singer and rx.search(singer_raw):
                singer, note = None, label
                break
        orchestra = GOLDEN_ORCH.get(orch_raw, titlecase(orch_raw) if orch_raw else "Unknown")
        if orch_raw == "GUITARRAS": orchestra = "Guitarras (solo singer)"
        if orch_raw == "ORQUESTA": orchestra = "Orquesta (unspecified)"
        obs = str(row[9]).strip()
        sid = hashlib.sha1(f"{title}|{orchestra}|{singer_legacy}|{year}|{row[7]}|{r}".encode()).hexdigest()[:10]
        if sid in seen: continue
        seen.add(sid)
        orchestra_id = slug(orchestra)
        date = parse_date(row[6])
        # years ending in 0 are decade placeholders in the source unless a full recording date backs them
        year_approx = year is not None and year % 10 == 0 and not (date and re.fullmatch(r"\d{4}-\d{2}-\d{2}", date))
        # "1940/70", "1950/60": a date range spanning more than two years is an undated row whatever the year column says
        rng = re.fullmatch(r"(\d{4})/(\d{2,4})", date or "")
        if rng:
            y0 = int(rng.group(1)); y1 = int(rng.group(2)) if len(rng.group(2)) == 4 else int(rng.group(1)[:2] + rng.group(2))
            if y1 - y0 > 2: year_approx = True
        transcription = bool(TRANSCRIPTION_NOTE_RE.search(obs) or TRANSCRIPTION_ALBUM_RE.search(str(row[7])))
        nt = norm_title(title)
        if singer in SINGER_STRING_FIX: singer = SINGER_STRING_FIX[singer]
        if (nt, orchestra_id, year) in SINGER_OVERRIDE:
            fixed = SINGER_OVERRIDE[(nt, orchestra_id, year)]
            singer = singercase(fixed) if fixed else None
        rhythm_fix = RHYTHM_OVERRIDE.get((nt, orchestra_id)) or RHYTHM_OVERRIDE.get((nt, None))
        if rhythm_fix is None and rhythm in ("tango", "vals", "milonga") and MEDLEY_RE.search(nt):
            rhythm_fix, note = "other", note or "medley"
        rhythm_original = rhythm if rhythm_fix and rhythm_fix != rhythm else None
        if rhythm_fix: rhythm = rhythm_fix
        songs.append({
            "id": sid,
            "title": titlecase(title),
            "rhythm": rhythm,
            "rhythmCode": rcode,
            "orchestra": orchestra,
            "orchestraId": orchestra_id,
            "singer": singer,
            "singerId": slug(singer) if singer else None,
            "vocal": singer is not None,
            "year": year,
            "date": date,
            "era": era_of(year),
            "album": str(row[7]).strip() or None,
            "notes": obs or None,
            "selection": obs.upper() == "SELECCIÓN",  # curator's selection flag
            "source": "listado-2008",
            **({"yearApprox": True} if year_approx else {}),
            **({"transcription": True} if transcription else {}),
            **({"rhythmOriginal": rhythm_original} if rhythm_original else {}),
            **({"note": note} if note else {}),
        })
    return songs

def _source_rank(s):
    """How well a row is sourced: a dated studio side on a numbered volume beats an undated compilation copy."""
    r = 0
    if s.get("date") and re.fullmatch(r"\d{4}-\d{2}-\d{2}", s["date"]): r += 3
    if s.get("selection"): r += 2
    if s.get("album"): r += 1
    if s.get("transcription"): r -= 4
    if s.get("yearApprox"): r -= 2
    if (s.get("notes") or "").upper().startswith("COL."): r -= 1   # Altaya / Magenta reissue collections
    return r

def dedupe(songs):
    """Merge duplicate rows (round 8): the same recording listed under several albums.
    1. (orchestra, normalised title, year, singer): keep the best-sourced row, carry selection/date over, keep the dropped ids as altIds.
    2. (orchestra, title, year) with one row naming a singer and another "instrumental" on the same recording date (or an
       undated copy): the instrumental copy is a mislabelled duplicate (Pugliese Farol 1943 Chanel) and folds into the vocal row."""
    groups = collections.OrderedDict()
    for s in songs:
        groups.setdefault((s["orchestraId"], norm_title(s["title"]), s["year"], s["singerId"]), []).append(s)
    merged = []
    for rows in groups.values():
        rows.sort(key=_source_rank, reverse=True)
        keep = dict(rows[0])
        alt = []
        for r in rows[1:]:
            alt.append(r["id"])
            if r.get("selection"): keep["selection"] = True
            if not keep.get("date") and r.get("date"): keep["date"] = r["date"]
            if not keep.get("album") and r.get("album"): keep["album"] = r["album"]
        if alt: keep["altIds"] = alt
        merged.append(keep)
    by_rec = collections.defaultdict(list)
    for s in merged:
        by_rec[(s["orchestraId"], norm_title(s["title"]), s["year"])].append(s)
    drop = set()
    for rows in by_rec.values():
        vocal = [r for r in rows if r["singerId"]]
        instr = [r for r in rows if not r["singerId"]]
        if not vocal or not instr: continue
        for i in instr:
            full = i.get("date") and re.fullmatch(r"\d{4}-\d{2}-\d{2}", i["date"])
            twin = next((v for v in vocal if full and v.get("date") == i["date"]), None)
            if twin is None and not full and not i.get("transcription"):
                twin = vocal[0]
            if twin is None: continue
            drop.add(i["id"])
            twin.setdefault("altIds", []).append(i["id"])
            if i.get("selection"): twin["selection"] = True
            for a in i.get("altIds", []): twin["altIds"].append(a)
    return [s for s in merged if s["id"] not in drop]

COLOUR_QUALITY = {10: ("avoid", 0), 52: ("single-tracks", 1), 13: ("uneven", 2), 11: ("good", 3), 15: ("fantastic", 4), 9: ("none", None), 22: ("none", None), 64: ("unknown", None), 51: ("uneven", 2), 53: ("good", 3)}

def build_coverage():
    wb = xlrd.open_workbook(SRC / "All_orchestras.xls", formatting_info=True)
    sh = wb.sheet_by_index(0)
    years = []
    for c in range(5, sh.ncols):
        dec = None
        for cc in range(c, 4, -1):
            v = sh.cell_value(0, cc)
            if isinstance(v, float) and v > 1900: dec = int(v); break
        d = sh.cell_value(1, c)
        years.append(dec + int(d) if dec is not None and isinstance(d, float) else None)
    cov = []
    r = 2
    while r < sh.nrows - 1:
        name = str(sh.cell_value(r, 0)).strip()
        if not name or str(sh.cell_value(r, 4)).strip() != "instr":
            r += 1; continue
        m = re.match(r"(.+?)\s*\((\d{4})-(\d{4}|\?*)\)", name)
        clean = m.group(1).strip() if m else name
        period = str(sh.cell_value(r, 1)).strip()
        def rowq(rr):
            out = {}
            for i, c in enumerate(range(5, sh.ncols)):
                y = years[i]
                if y is None: continue
                ci = wb.xf_list[sh.cell_xf_index(rr, c)].background.pattern_colour_index
                q = COLOUR_QUALITY.get(ci, ("unknown", None))
                if q[1] is not None: out[str(y)] = q[1]
            return out
        cov.append({
            "orchestra": clean, "orchestraId": slug(clean),
            "born": int(m.group(2)) if m else None,
            "died": int(m.group(3)) if m and m.group(3).isdigit() else None,
            "activePeriod": period or None,
            "recordingsTotal": int(sh.cell_value(r, 2)) if isinstance(sh.cell_value(r, 2), float) else None,
            "inArchive": int(sh.cell_value(r, 3)) if isinstance(sh.cell_value(r, 3), float) else None,
            "instrumental": rowq(r), "vocal": rowq(r + 1),
        })
        r += 2
    return cov

def fix_range_years(songs):
    """Round 13 (round13-best-years.md §4.1): a "1933/48", "1940/70" row is a compilation or a transcription whose
    lower bound is not a recording year (Ricardo Ruíz "in 1933", Rivero with Troilo "in 1940"). When the range spans
    more than two years the row keeps its date and era but loses its year (`year: null`, `dateRange: [y0, y1]`), so no
    year statistic reads it. A curated YEAR_OVERRIDE puts a known recording year back (Niebla del Riachuelo, 1937)."""
    for s in songs:
        fix = YEAR_OVERRIDE.get((norm_title(s["title"]), s["orchestraId"], s["singer"]))
        if fix:
            s["year"] = fix; s["era"] = era_of(fix); s.pop("yearApprox", None)
            continue
        m = re.fullmatch(r"(\d{4})/(\d{2,4})", s.get("date") or "")
        if not m: continue
        y0 = int(m.group(1)); y1 = int(m.group(2)) if len(m.group(2)) == 4 else int(m.group(1)[:2] + m.group(2))
        if y1 - y0 > 2:
            s["year"] = None; s["dateRange"] = [y0, y1]; s["yearApprox"] = True
    return songs

# --- Round 14 (docs/reviews/round14-discography.md §2, docs/specs/round14-engine.md) -------------------------------
# Id-level corrections: the ids are hashes of the source row, so they survive a rebuild.
ID_PATCH = {
    # Trago amargo 1939-12-22 is the Echagüe estribillo side (tango.info T0370028708), not an instrumental
    "9df440312c": {"singer": "Alberto Echagüe", "singerId": "alberto-echague", "vocal": True},
    # Champagne tango 1938 is a Quinteto Don Pancho side (dir. F. Canaro, 1938-05-09), not the Orquesta Típica
    "f0c378b199": {"orchestra": "Quinteto Don Pancho", "orchestraId": "quinteto-don-pancho", "date": "1938-05-09"},
    # La zandunga is a canción popular mexicana (a son istmeño in 3/4), recorded 1939-07-14: not a vals criollo
    "5ac52c1b19": {"rhythm": "other", "rhythmOriginal": "vals", "date": "1939-07-14", "note": "canción popular mexicana"},
    # Schertzinger's Marcheta (label "Marchéta (Marquitta)"), Biagi instrumental vals 1941-12-03
    "06146844d4": {"title": "Marcheta", "altTitles": ["Marquita"], "date": "1941-12-03"},
    # two 1943 Demare/Berón recordings were merged: the censored "su voz" lyric of 1943-09-13 is the one played; the
    # 1943-05-06 "mi alcohol" side is split out below (SPLIT_ROWS)
    "215948d8ab": {"title": "Tal Vez Será su Voz", "altTitles": ["Tal Vez Será mi Alcohol"], "date": "1943-09-13"},
    # El lengue (Donato 1940-12-13): tango.info files it as a milonga
    "b41093302a": {"rhythm": "milonga", "rhythmOriginal": "tango"},
    "bf6e0c24a9": {"date": "1938-10-17"},   # Viejo portón (Biagi's first session)
    "f94dd3fd89": {"date": "1938-10-17"},   # Unión Cívica (Biagi)
    "2a56a78278": {"date": "1937-12-09"},   # El cencerro
    "4d0e9d5353": {"date": "1940-04-12"},   # A mí no me interesa
    "cebfbd8996": {"altTitles": ["El 13"]},  # El trece
}
# rows the source merged: the second recording as its own row (dated, no stream: never picked before it resolves)
SPLIT_ROWS = [
    {"from": "215948d8ab", "title": "Tal Vez Será mi Alcohol", "date": "1943-05-06", "altTitles": ["Tal Vez Será su Voz"]},
]
# same-date duplicate rows: the label credit with the glosa is the same 1943-07-23 side (merged into the first id)
MERGE_ROWS = {"bf32d35a4f": "e5a625fa47"}
# title fixes by work (normalised title → display title), applied to every orchestra's row of that work
TITLE_WORK = {
    "adios arrabal": "Adiós, Arrabal",
    "dime mi amor": "Dime, mi Amor",
    "yo tambien sone": "Yo También Soñé",
    "lejos de ti": "Lejos de Ti",
    "vivo sin sombra lejos de ti": "Vivo sin Sombra, Lejos de Ti",
    "un crimen": "Un Crimen",
    "ya se que siguen hablando": "Ya Sé que Siguen Hablando",
    "que buena es": "Qué Buena Es",
    "como se hace un tango": "Cómo Se Hace un Tango",
    "este es tu tango": "Este Es tu Tango",
    "pa que seguir": "Pa' Qué Seguir",
    "que noche": "Qué Noche",
    "por que no has venido": "¿Por Qué No Has Venido?",
    "re fa si": "Re Fa Si",
    "don alvaro": "Don Álvaro",
    # a bracketed dedication or gloss moves to altTitles
    "milonguero viejo": ("Milonguero Viejo", ["Fresedo"]),
    "comme il faut": ("Comme Il Faut", ["Como Debe Ser"]),
    "shusheta": ("Shusheta", ["El Aristócrata"]),
}
# the leaders whose surname in brackets is a dedication or an orchestra tag, never part of the title (dancer R14-12)
LEADER_SURNAMES = {norm_title(v).split()[-1] for v in GOLDEN_ORCH.values()} | {"d arienzo", "di sarli", "de caro"}
PAREN_RE = re.compile(r"\s*\(([^()]*)\)")

def clean_parentheticals(title):
    """"Milonguero Viejo(fresedo)" → ("Milonguero Viejo", ["Fresedo"]); "Chiqué(el Elegante)" → "Chiqué (El Elegante)".
    A doubled parenthetical collapses; a leader's surname moves to altTitles; a lower-case first letter is re-cased."""
    alts, parts, seen = [], [], set()
    for m in PAREN_RE.finditer(title):
        inner = m.group(1).strip()
        if not inner or inner.lower() in seen: continue
        seen.add(inner.lower())
        n = norm_title(inner)
        if n in LEADER_SURNAMES or n.split()[-1:] and " ".join(n.split()[-2:]) in LEADER_SURNAMES:
            alts.append(inner[:1].upper() + inner[1:]); continue
        parts.append("(" + inner[:1].upper() + inner[1:] + ")")
    head = PAREN_RE.sub("", title).strip()
    return (" ".join([head] + parts), alts)

def undated_compilation(s):
    """Round 14 (discography R9): no recording date, and an album that names neither the orchestra nor the singer
    (a mixed compilation such as "TRA LA LA", "VOCES FEMENINAS X"): quinteto and solo-singer sides slip in that way."""
    if s.get("date"): return False
    alb = norm_title(s.get("album") or "")
    keys = [w for w in norm_title(s["orchestra"]).split() if len(w) > 2][-1:]
    if s.get("singer"): keys += [w for w in norm_title(s["singer"]).split() if len(w) > 2][-1:]
    return not any(k in alb for k in keys)

def apply_round14(songs):
    by_id = {s["id"]: s for s in songs}
    for drop, keep in MERGE_ROWS.items():
        if drop in by_id and keep in by_id:
            k = by_id[keep]
            k["altIds"] = sorted(set((k.get("altIds") or []) + [drop] + (by_id[drop].get("altIds") or [])))
            if by_id[drop].get("selection"): k["selection"] = True
    songs = [s for s in songs if s["id"] not in MERGE_ROWS or MERGE_ROWS[s["id"]] not in by_id]
    for sp in SPLIT_ROWS:
        src = by_id.get(sp["from"])
        if not src: continue
        row = {**{k: v for k, v in src.items() if k not in ("altIds", "selection")}, **{k: v for k, v in sp.items() if k != "from"}}
        row["id"] = hashlib.sha1(f"{row['title']}|{row['orchestra']}|{row['singer']}|{row['date']}|split".encode()).hexdigest()[:10]
        row["album"] = None
        row["notes"] = "round 14: split from " + sp["from"]
        songs.append(row)
    for s in songs:
        t, alts = clean_parentheticals(s["title"])
        w = TITLE_WORK.get(norm_title(s["title"]))
        if isinstance(w, tuple): t, alts = w[0], alts + w[1]
        elif w: t = w
        if t != s["title"]:
            s["title"] = t
        if alts: s["altTitles"] = sorted(set((s.get("altTitles") or []) + alts))
        p = ID_PATCH.get(s["id"])
        if p:
            for k, v in p.items():
                s[k] = sorted(set((s.get(k) or []) + v)) if k == "altTitles" else v
            if "date" in p and re.fullmatch(r"\d{4}-\d{2}-\d{2}", p["date"]):
                s["year"] = int(p["date"][:4]); s["era"] = era_of(s["year"]); s.pop("yearApprox", None)
        if undated_compilation(s): s["undatedCompilation"] = True
        else: s.pop("undatedCompilation", None)
    return songs

def main():
    raw = build_songs()
    songs = apply_round14(fix_range_years(dedupe(raw)))
    coverage = build_coverage()
    cov_by_id = {c["orchestraId"]: c for c in coverage}
    orchestras = collections.OrderedDict()
    singers = collections.OrderedDict()
    for s in songs:
        o = orchestras.setdefault(s["orchestraId"], {"id": s["orchestraId"], "name": s["orchestra"], "count": 0, "years": [], "rhythms": collections.Counter(), "singers": collections.Counter(), "vocal": 0})
        o["count"] += 1
        if s["year"]: o["years"].append(s["year"])
        o["rhythms"][s["rhythm"]] += 1
        if s["singer"]:
            o["singers"][s["singer"]] += 1; o["vocal"] += 1
            sg = singers.setdefault(s["singerId"], {"id": s["singerId"], "name": s["singer"], "count": 0, "orchestras": collections.Counter(), "years": []})
            sg["count"] += 1; sg["orchestras"][s["orchestra"]] += 1
            if s["year"]: sg["years"].append(s["year"])
    def finish(d, keyc):
        for v in d.values():
            ys = sorted(v.pop("years"))
            v["yearRange"] = [ys[0], ys[-1]] if ys else None
            for k in keyc: v[k] = dict(v[k].most_common(12))
        return list(d.values())
    orch_list = finish(orchestras, ["rhythms", "singers"])
    for o in orch_list:
        c = cov_by_id.get(o["id"])
        o["coverage"] = {"instrumental": c["instrumental"], "vocal": c["vocal"], "activePeriod": c["activePeriod"]} if c else None
    orch_list.sort(key=lambda x: -x["count"])
    singer_list = finish(singers, ["orchestras"]); singer_list.sort(key=lambda x: -x["count"])
    meta = {
        "builtAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "songs": len(songs), "orchestras": len(orch_list), "singers": len(singer_list),
        "rhythms": dict(collections.Counter(s["rhythm"] for s in songs).most_common()),
        "eras": dict(collections.Counter(s["era"] for s in songs).most_common()),
        "sources": [p.name for p in sorted(SRC.iterdir())],
        "rawRows": len(raw),
        "mergedDuplicates": len(raw) - len(songs),
        "transcriptions": sum(1 for s in songs if s.get("transcription")),
        "yearApprox": sum(1 for s in songs if s.get("yearApprox")),
        "rhythmFixed": sum(1 for s in songs if s.get("rhythmOriginal")),
        "pseudoSingers": sum(1 for s in songs if s.get("note")),
        "undatedCompilations": sum(1 for s in songs if s.get("undatedCompilation")),
        "version": 3,
    }
    (OUT / "songs.json").write_text(json.dumps(songs, ensure_ascii=False, separators=(",", ":")))
    (OUT / "orchestras.json").write_text(json.dumps(orch_list, ensure_ascii=False, indent=1))
    (OUT / "singers.json").write_text(json.dumps(singer_list, ensure_ascii=False, indent=1))
    (OUT / "coverage.json").write_text(json.dumps(coverage, ensure_ascii=False, indent=1))
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    print(json.dumps(meta, indent=2))

if __name__ == "__main__":
    main()
