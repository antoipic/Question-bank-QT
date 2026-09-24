"""Extract QCM questions from pdf/livret.pdf.

Text comes from the PDF text layer (exact copy). The circled answer comes from
the handwritten ink annotations (circles), cross-checked against the answer key
(pages 70-77) and the reviewer notes (pages 80-99).

Usage: python3 tools/extract.py FIRST_PAGE LAST_PAGE   (PDF page numbers)
Merges results into app/questions.json and writes tools/report.json.
"""
import json
import re
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "pdf" / "livret.pdf"
LETTERS = "ABCD"


def answer_key(doc):
    key = {}
    for i in range(69, 77):
        tokens = [t.strip() for t in doc[i].get_text().split("\n") if t.strip()]
        for a, b in zip(tokens, tokens[1:]):
            if a.isdigit() and b in LETTERS and len(b) == 1:
                key.setdefault(int(a), b)
    return key


def notes(doc):
    out = {}
    for i in range(79, 99):
        tokens = [t.strip() for t in doc[i].get_text().split("\n") if t.strip()]
        for j, t in enumerate(tokens):
            if re.fullmatch(r"\d+-\d+", t) and j + 2 < len(tokens) and "Reponse" in tokens[j + 1]:
                out[t] = tokens[j + 2]
    return out


def spans(page):
    res = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                if s["text"].strip():
                    res.append((s["bbox"], s["text"]))
    return res


def parse_page(page):
    """Return list of questions (text, choices, circled letters, doubt marks)."""
    sp = [s for s in spans(page) if s[0][1] > 95 and s[0][0] < 560]
    sp.sort(key=lambda s: (round(s[0][1]), s[0][0]))
    starts = [(s[0][1], int(s[1].strip()[:-1])) for s in sp
              if s[0][0] < 66 and re.fullmatch(r"\d+\.", s[1].strip())]
    qs = []
    for i, (y, num) in enumerate(starts):
        yend = starts[i + 1][0] if i + 1 < len(starts) else 1e9
        region = [s for s in sp if y - 1 <= s[0][1] < yend - 1]
        # drop centred headings (chapter titles): lines with no span starting in the left column
        region = [s for s in region if s[0][0] < 100 or any(
            abs(o[0][1] - s[0][1]) < 3 and o[0][0] < 100 for o in region)]
        labels = sorted([(s[1].strip()[0], s[0][1], s[0][3], s[0][0]) for s in region
                         if s[0][0] < 90 and re.fullmatch(r"[A-D]\.", s[1].strip())], key=lambda l: l[1])
        first = labels[0][1] - 3 if labels else 1e9
        qtext, ch = [], {}
        for (x0, y0, x1, y1), t in region:
            ts = t.strip()
            if re.fullmatch(r"\d+\.", ts) and x0 < 66 or re.fullmatch(r"[A-D]\.", ts) and x0 < 90:
                continue
            if y0 < first:
                qtext.append(ts)
            else:
                mid = (y0 + y1) / 2
                best = labels[0][0]
                for L, ly0, ly1, _ in labels:
                    if ly0 - 3 <= mid:
                        best = L
                ch.setdefault(best, []).append(t)
        qs.append({"num": num, "y": y, "yend": yend, "labels": labels,
                   "question": re.sub(r"\s+", " ", " ".join(qtext)).strip(),
                   "choix": [re.sub(r"\s+", " ", " ".join(ch.get(L[0], []))).strip() for L in labels],
                   "ink": [], "marks": 0, "doubt": 0})
    # ink strokes: circles around a label, or other marks (question marks, arrows)
    for a in page.annots():
        if a.type[1] != "Ink":
            continue
        green = a.colors["stroke"][1] > 0.9 and a.colors["stroke"][2] < 0.5
        for stroke in a.vertices:
            xs = [p[0] for p in stroke]; ys = [p[1] for p in stroke]
            w, h = max(xs) - min(xs), max(ys) - min(ys)
            cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
            if w < 3 and h < 3:
                continue
            q = next((q for q in qs if q["y"] - 12 <= cy < q["yend"] - 12), None)
            if q is None:
                continue
            if w >= 12 and h >= 10 and cx > 64 and q["labels"]:
                L = min(q["labels"], key=lambda l: abs((l[1] + l[2]) / 2 - cy))
                if abs((L[1] + L[2]) / 2 - cy) < 9:
                    q["ink"].append(L[0])
                    if green:
                        q.setdefault("green", []).append(L[0])
                    continue
            if cx < 64:
                q["doubt"] += 1   # "?" or arrow in the left margin
            else:
                q["marks"] += 1   # handwritten note in the text
    tags = [(s[0][1], s[1].strip()) for s in spans(page)
            if s[0][0] > 560 and re.fullmatch(r"\d+-\d+", s[1].strip())]
    for q in qs:
        q["tag"] = next((t for ty, t in tags if q["y"] <= ty < q["yend"]), None)
    return qs, []


def main(first, last):
    doc = pymupdf.open(PDF)
    key, nts = answer_key(doc), notes(doc)
    out_path = ROOT / "app" / "questions.json"
    existing = {q["id"]: q for q in json.loads(out_path.read_text())} if out_path.exists() else {}
    report = []
    auto_path = ROOT / "tools" / "auto_doutes.json"
    auto = {int(k): v for k, v in json.loads(auto_path.read_text()).items()} if auto_path.exists() else {}
    for pno in range(first, last + 1):
        page = doc[pno - 1]
        qs, _ = parse_page(page)
        for slot, q in enumerate(qs, 1):
            tag = q["tag"] or f"{pno}-{slot}"
            ink = sorted(set(q["ink"]))
            k = key.get(q["num"])
            n = nts.get(tag)
            reponse = ink[0] if len(ink) == 1 else None
            green = sorted(set(q.get("green", [])))
            auto_doute = None
            if len(ink) > 1 and len(green) == 1:
                reponse = green[0]
                others = ", ".join(l for l in ink if l != green[0])
                auto_doute = (f"Deux cercles : {others} en bleu, {green[0]} en vert (correction). " +
                              (f"Corrigé : {k}, note : {n}. Vert retenu." if green[0] == k else
                               f"⚠ Le corrigé et la note donnent {k}. Corrigé officiel retenu."))
            elif ink and reponse and reponse != k:
                auto_doute = (f"{reponse} est entouré, mais le corrigé et la note donnent {k}. "
                              f"Corrigé officiel retenu.")
            auto.pop(q["num"], None)
            if auto_doute:
                auto[q["num"]] = auto_doute
            existing[q["num"]] = {
                "id": q["num"],
                "question": q["question"],
                "choix": q["choix"],
                "reponse": k,  # official answer key always wins
                "page": pno,
                "image": existing.get(q["num"], {}).get("image"),
            }
            report.append({"id": q["num"], "page": pno, "ink": ink, "key": k, "note": n,
                           "nchoix": len(q["choix"]), "marks": q["marks"], "doubt": q["doubt"],
                           "ok": len(ink) == 1 and ink[0] == k == n and all(q["choix"])
                           and q["question"] and not q["marks"] and not q["doubt"]})
    auto_path.write_text(json.dumps(auto, ensure_ascii=False, indent=1))
    ov = {str(k): {"doute": v} for k, v in auto.items()}
    for sid, o in json.loads((ROOT / "tools" / "overrides.json").read_text()).items():
        ov.setdefault(sid, {}).update(o)
    for sid, o in ov.items():
        q = existing.get(int(sid))
        if q:
            for f in ("question", "choix", "image"):
                if f in o:
                    q[f] = o[f]
    data = sorted(existing.values(), key=lambda q: q["id"])
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    rep = ROOT / "tools" / "report.json"
    old = json.loads(rep.read_text()) if rep.exists() else []
    ids = {r["id"] for r in report}
    rep.write_text(json.dumps(sorted([r for r in old if r["id"] not in ids] + report, key=lambda r: r["id"]), indent=1))
    groups = {"conflit": [], "marque": [], "vert": []}
    for sid, o in sorted(ov.items(), key=lambda kv: int(kv[0])):
        if "doute" in o and int(sid) in existing:
            q = existing[int(sid)]
            d = o["doute"]
            g = "conflit" if ("⚠" in d or "mais le corrigé" in d) else "marque" if "?" in d or "Pas de cercle" in d else "vert"
            groups[g].append(f"| {sid} | {q['page']} | **{q['reponse']}** | {d} |")
    head = ["| Question | Page PDF | Réponse retenue | Détail |", "|---|---|---|---|"]
    md = ["# Doutes", "",
          "Règle : la réponse retenue est toujours celle du corrigé officiel (p. 70-77).",
          "Chaque réponse a été comparée au corrigé officiel (p. 70-77) et aux notes (p. 80-99).", "",
          f"## 1. Cercle différent du corrigé officiel ({len(groups['conflit'])}) — corrigé officiel retenu", ""]
    md += head + groups["conflit"]
    md += ["", f"## 2. « ? » ou absence de cercle ({len(groups['marque'])})", ""] + head + groups["marque"]
    md += ["", f"## 3. Deux cercles, bleu et vert ({len(groups['vert'])}) — le vert est identique au corrigé", ""]
    md += head + groups["vert"]
    (ROOT / "doutes.md").write_text("\n".join(md) + "\n")
    missing = [q["id"] for q in data if not q["reponse"]]
    if missing:
        print("NO ANSWER:", missing)
    for r in report:
        if not r["ok"]:
            print("CHECK", r)
    print(len(report), "questions, pages", first, "-", last)


if __name__ == "__main__":
    main(int(sys.argv[1]), int(sys.argv[2]))
