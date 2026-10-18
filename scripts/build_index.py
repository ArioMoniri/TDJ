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
        singer = None if singer_raw.upper() in ("", "INSTRUMENTAL") else titlecase(singer_raw)
        orchestra = GOLDEN_ORCH.get(orch_raw, titlecase(orch_raw) if orch_raw else "Unknown")
        if orch_raw == "GUITARRAS": orchestra = "Guitarras (solo singer)"
        if orch_raw == "ORQUESTA": orchestra = "Orquesta (unspecified)"
        obs = str(row[9]).strip()
        sid = hashlib.sha1(f"{title}|{orchestra}|{singer}|{year}|{row[7]}|{r}".encode()).hexdigest()[:10]
        if sid in seen: continue
        seen.add(sid)
        songs.append({
            "id": sid,
            "title": titlecase(title),
            "rhythm": rhythm,
            "rhythmCode": rcode,
            "orchestra": orchestra,
            "orchestraId": slug(orchestra),
            "singer": singer,
            "singerId": slug(singer) if singer else None,
            "vocal": singer is not None,
            "year": year,
            "date": parse_date(row[6]),
            "era": era_of(year),
            "album": str(row[7]).strip() or None,
            "notes": obs or None,
            "selection": obs.upper() == "SELECCIÓN",  # curator's selection flag
            "source": "listado-2008",
        })
    return songs

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

def main():
    songs = build_songs()
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
        "version": 1,
    }
    (OUT / "songs.json").write_text(json.dumps(songs, ensure_ascii=False, separators=(",", ":")))
    (OUT / "orchestras.json").write_text(json.dumps(orch_list, ensure_ascii=False, indent=1))
    (OUT / "singers.json").write_text(json.dumps(singer_list, ensure_ascii=False, indent=1))
    (OUT / "coverage.json").write_text(json.dumps(coverage, ensure_ascii=False, indent=1))
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    print(json.dumps(meta, indent=2))

if __name__ == "__main__":
    main()
