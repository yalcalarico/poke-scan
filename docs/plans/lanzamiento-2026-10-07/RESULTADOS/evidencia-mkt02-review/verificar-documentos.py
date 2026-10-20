# coding: utf-8
"""Verificación estática exclusiva de la entrega MKT-02, sin runtime."""
from pathlib import Path
import datetime
import difflib
import hashlib
import json
import re
import unicodedata
from urllib.parse import unquote

EVIDENCE = Path(__file__).resolve().parent
RESULTS = EVIDENCE.parent
ROOT = RESULTS.parents[3]
BASELINE = json.loads((EVIDENCE / "baseline.json").read_text())
DOCS = [RESULTS / name for name in (
    "MKT-02-beta.md", "MKT-02-evidencia.md", "MKT-02-review.md"
)]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(name, value):
    (EVIDENCE / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def anchors(path):
    text = re.sub(r"```.*?```", "", path.read_text(), flags=re.S)
    counts = {}
    result = set()
    for heading in re.findall(r"^#{1,6} (.+)$", text, re.M):
        slug = "".join(char for char in heading.lower()
                       if char == "-" or char == "_" or char.isspace()
                       or unicodedata.category(char)[0] in "LN")
        slug = slug.replace(" ", "-")
        number = counts.get(slug, 0)
        counts[slug] = number + 1
        result.add(slug if not number else slug + "-" + str(number))
    return result


def tables(text):
    result = []
    active = []
    for line in text.splitlines() + [""]:
        if line.startswith("|"):
            active.append(line)
        elif active:
            result.append({"columns": len(active[0].split("|")) - 2,
                           "dataRows": len(active) - 2})
            active = []
    return result


sources = []
for item in BASELINE["sources"]:
    path = ROOT / item["path"]
    actual = sha(path)
    sources.append({**item, "sha256AtClose": actual,
                    "unchangedSinceReviewBaseline": actual == item["sha256"]})
write("fuentes-verificadas.json", {
    "capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "scope": "Once fuentes selectivas; diferencias concurrentes no atribuidas al revisor.",
    "sources": sources,
})

diff = ""
for name in ("MKT-02-beta.md", "MKT-02-evidencia.md"):
    old = EVIDENCE / (name.removesuffix(".md") + "-recibido.md")
    new = RESULTS / name
    diff += "".join(difflib.unified_diff(
        old.read_text().splitlines(keepends=True),
        new.read_text().splitlines(keepends=True),
        fromfile=str(old.relative_to(ROOT)), tofile=str(new.relative_to(ROOT))))
(EVIDENCE / "correcciones.diff").write_text(diff)

# Los destinos generados se crean antes de comprobar enlaces a estos archivos.
write("validacion.json", {})
write("hashes-finales.json", {})
links = []
for doc in DOCS:
    for destination in re.findall(r"\[[^\]]+\]\(([^)]+)\)", doc.read_text()):
        if "://" in destination:
            continue
        base, _, fragment = destination.partition("#")
        target = (doc.parent / unquote(base)).resolve() if base else doc
        exists = target.is_file()
        anchor_ok = not fragment or (exists and target.suffix == ".md"
                                     and unquote(fragment) in anchors(target))
        links.append({"from": str(doc.relative_to(ROOT)), "destination": destination,
                      "exists": exists, "anchorValid": anchor_ok})

beta = DOCS[0].read_text()
received = (EVIDENCE / "MKT-02-beta-recibido.md").read_text()
structure = {doc.name: tables(doc.read_text()) for doc in DOCS}
checks = {
    "betaTables3Channels8Stages5Schedule": structure["MKT-02-beta.md"] == [
        {"columns": 6, "dataRows": 3}, {"columns": 2, "dataRows": 8},
        {"columns": 3, "dataRows": 5}],
    "receivedHad7Stages": tables(received)[1]["dataRows"] == 7,
    "elevenReceivedHashesMatched": len(json.loads((EVIDENCE / "hashes-recibidos-verificados.json").read_text())) == 11
        and all(row["match"] for row in json.loads((EVIDENCE / "hashes-recibidos-verificados.json").read_text())),
    "linksAndAnchorsValid": all(item["exists"] and item["anchorValid"] for item in links),
    "D28WindowAndEligibility": "[activatedAt + 28 días, activatedAt + 35 días)" in beta
        and "activatedAt + 35 días ≤ T" in beta,
    "individualEvidenceMax90FromSession": "como máximo a los 90 días desde la sesión inicial" in beta,
    "noSuccessWithoutConfirmedSave": "sin acreditarlos como éxitos si no hubo guardado confirmado y comprobado" in beta,
    "sourceAndReceivedHashesTracked": len(sources) == 11,
}
write("validacion.json", {
    "method": "Inspección documental local y sondas estáticas; no suite de aplicación.",
    "checks": checks, "tables": structure, "links": links,
    "linkCounts": {doc.name: sum(item["from"] == str(doc.relative_to(ROOT)) for item in links)
                   for doc in DOCS},
    "allChecksPassed": all(checks.values()),
})
finals = sorted(path for path in EVIDENCE.iterdir()
                if path.is_file() and path.name != "hashes-finales.json") + DOCS
write("hashes-finales.json", [{"path": str(path.relative_to(ROOT)), "sha256": sha(path)} for path in finals])
print(json.dumps({"checks": checks, "tables": structure,
                  "localLinks": len(links), "finalHashedFiles": len(finals),
                  "changedSources": [item["path"] for item in sources if not item["unchangedSinceReviewBaseline"]]},
                 indent=2, ensure_ascii=False))
if not all(checks.values()):
    raise SystemExit(1)
