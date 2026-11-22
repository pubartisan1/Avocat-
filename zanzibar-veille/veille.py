"""Veille quotidienne Zanzibar + recherche d'idées business par une équipe d'agents IA.

Usage :  python zanzibar-veille/veille.py
"""

from __future__ import annotations

import html
import json
import os
import re
import smtplib
import sys
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import agents  # noqa: E402
import collecte  # noqa: E402
import ia  # noqa: E402

ICI = Path(__file__).parent
DATA = ICI / "data"
RAPPORTS = ICI / "rapports"
SITE = ICI.parent / "docs"
F_ARTICLES = DATA / "articles.json"
F_IDEES = DATA / "idees.json"
F_ANALYSES = DATA / "analyses.json"

AUJ = datetime.now(timezone.utc).strftime("%Y-%m-%d")
LABELS = {"tensions": "⚠️ Tensions habitants", "tourisme": "🏝️ Tourisme", "politique": "🏛️ Politique",
          "business": "💼 Business", "autre": "📰 Autre"}


def charge(f: Path, defaut):
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return defaut


def sauve(f: Path, data) -> None:
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------- idées
def score(notes: dict) -> int:
    vals = [float(notes.get(c, 0) or 0) for c in agents.CRITERES]
    return round(sum(vals) / len(vals) * 10) if vals else 0


def fusionne_idees(idees: list[dict], nouvelles: list[dict], critiques: list[dict]) -> list[dict]:
    titres = {i["titre"].lower() for i in idees}
    for idee, crit in zip(nouvelles, critiques + [{}] * len(nouvelles)):
        if not idee.get("titre") or idee["titre"].lower() in titres:
            continue
        notes = crit.get("notes", {}) if isinstance(crit, dict) else {}
        idee.update({
            "notes": notes,
            "score_total": score(notes),
            "verdict": crit.get("verdict", "?"),
            "faiblesses": crit.get("faiblesses", []),
            "a_verifier_sur_place": crit.get("a_verifier_sur_place", []),
            "amelioration": crit.get("amelioration", ""),
            "premiere_vue": AUJ,
            "derniere_maj": AUJ,
        })
        idees.append(idee)
        titres.add(idee["titre"].lower())
    idees.sort(key=lambda i: (not str(i.get("verdict", "")).upper().startswith("NON"), i.get("score_total", 0)),
               reverse=True)
    return idees


# ---------------------------------------------------------------- rapport
def rapport_markdown(nouveaux: list[dict], analyse: dict | None, idees: list[dict]) -> str:
    L = [f"# 🌴 Veille Zanzibar — {AUJ}", ""]
    if not ia.available():
        L += ["> ℹ️ Mode **sans IA** : ajoute une clé gratuite (voir README) pour activer les agents.", ""]
    if analyse:
        L += ["## Synthèse du jour", "", analyse.get("resume", ""), ""]
        for cle, titre in [("alertes", "🚨 Alertes"), ("tensions", "⚠️ Habitants vs tourisme / hôtels"),
                           ("tourisme", "🏝️ Tourisme"), ("politique_economie", "🏛️ Politique & économie"),
                           ("signaux_business", "💡 Signaux business")]:
            if analyse.get(cle):
                L += [f"## {titre}", ""] + [f"- {x}" for x in analyse[cle]] + [""]
    if idees:
        c = idees[0]
        L += ["## 🏆 Idée championne", "", f"### {c['titre']} — {c.get('score_total', '?')}/100 ({c.get('verdict', '')})",
              "", c.get("concept", ""), ""]
        strat = c.get("strategie")
        if strat:
            L += [f"**Impact des actus du jour :** {strat.get('impact_actus_du_jour', '')}", "",
                  f"**Test rapide (< 200 €) :** {strat.get('test_rapide_a_faible_cout', '')}", "", "**Plan 30 jours :**"]
            L += [f"- {p}" for p in strat.get("plan_30_jours", [])] + [""]
        L += ["## 📊 Classement des idées", "", "| # | Idée | Score | Verdict | Depuis |", "|---|---|---|---|---|"]
        for n, i in enumerate(idees[:15], 1):
            L.append(f"| {n} | {i['titre']} | {i.get('score_total', '?')} | {i.get('verdict', '')} | {i.get('premiere_vue', '')} |")
        L.append("")
    L += [f"## 📰 Nouveaux articles ({len(nouveaux)})", ""]
    for cat in LABELS:
        groupe = [a for a in nouveaux if a["categorie"] == cat]
        if groupe:
            L += [f"### {LABELS[cat]}", ""] + [f"- [{a['titre']}]({a['lien']}) — *{a['source']}, {a['date'][:10]}*" for a in groupe] + [""]
    return "\n".join(L)


def md_inline(s: str) -> str:
    s = html.escape(str(s))
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"\[(.+?)\]\((https?://[^)]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', s)
    return s


def md_vers_html(md: str) -> str:
    out, en_liste, en_table = [], False, False
    for ligne in md.splitlines():
        if ligne.startswith("- "):
            if not en_liste:
                out.append("<ul>"); en_liste = True
            out.append(f"<li>{md_inline(ligne[2:])}</li>")
            continue
        if en_liste:
            out.append("</ul>"); en_liste = False
        if ligne.startswith("|"):
            cells = [c.strip() for c in ligne.strip("|").split("|")]
            if set("".join(cells)) <= set("-"):
                continue
            if not en_table:
                out.append("<div class=t><table>"); en_table = True
                out.append("<tr>" + "".join(f"<th>{md_inline(c)}</th>" for c in cells) + "</tr>")
            else:
                out.append("<tr>" + "".join(f"<td>{md_inline(c)}</td>" for c in cells) + "</tr>")
            continue
        if en_table:
            out.append("</table></div>"); en_table = False
        m = re.match(r"^(#{1,3}) (.*)", ligne)
        if m:
            n = len(m.group(1))
            out.append(f"<h{n}>{md_inline(m.group(2))}</h{n}>")
        elif ligne.startswith("> "):
            out.append(f"<blockquote>{md_inline(ligne[2:])}</blockquote>")
        elif ligne.strip():
            out.append(f"<p>{md_inline(ligne)}</p>")
    if en_liste:
        out.append("</ul>")
    if en_table:
        out.append("</table></div>")
    return "\n".join(out)


def page_html(md: str, archives: list[str], prefixe: str) -> str:
    liens = " · ".join(f'<a href="{prefixe}rapports/{d}.html">{d}</a>' for d in archives[:60])
    return f"""<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Veille Zanzibar</title>
<style>
:root{{--bg:#f7f5f0;--fg:#1d2730;--muted:#5d6b75;--card:#fff;--accent:#0b7a75;--line:#e3ded3}}
@media (prefers-color-scheme:dark){{:root{{--bg:#11171c;--fg:#e6edf0;--muted:#9aa8b0;--card:#1a2228;--accent:#4fd1c5;--line:#2a343b}}}}
body{{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}}
main{{max-width:880px;margin:0 auto;padding:24px 16px 64px}}
h1{{font-size:1.8rem;margin:.2em 0 .6em}} h2{{margin-top:2em;border-bottom:2px solid var(--line);padding-bottom:.2em}}
a{{color:var(--accent)}} li{{margin:.35em 0}}
blockquote{{margin:0;padding:12px 16px;background:var(--card);border-left:4px solid var(--accent);border-radius:6px}}
.t{{overflow-x:auto}} table{{border-collapse:collapse;width:100%;background:var(--card)}}
th,td{{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;font-size:.95rem}}
footer{{margin-top:3em;color:var(--muted);font-size:.85rem}}
</style></head><body><main>
{md_vers_html(md)}
<footer><b>Archives :</b> {liens}<br>Généré automatiquement le {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC.</footer>
</main></body></html>"""


def envoie_email(md: str) -> None:
    user, pwd, dest = (os.environ.get(k) for k in ("SMTP_USER", "SMTP_PASSWORD", "EMAIL_TO"))
    if not (user and pwd and dest):
        return
    msg = MIMEText(page_html(md, [], ""), "html", "utf-8")
    msg["Subject"], msg["From"], msg["To"] = f"🌴 Veille Zanzibar — {AUJ}", user, dest
    try:
        with smtplib.SMTP_SSL(os.environ.get("SMTP_HOST", "smtp.gmail.com"), 465, timeout=30) as s:
            s.login(user, pwd)
            s.send_message(msg)
        print("📧 e-mail envoyé")
    except Exception as exc:  # noqa: BLE001
        print(f"⚠ e-mail non envoyé : {exc}")


# ---------------------------------------------------------------- main
def main() -> None:
    print(f"🌴 Veille Zanzibar — {AUJ}")
    print(f"IA disponibles : {', '.join(ia.available()) or 'aucune (mode sans IA)'}")

    print("📡 Collecte…")
    historique = charge(F_ARTICLES, [])
    connus = {a["id"] for a in historique}
    articles = collecte.collecter()
    nouveaux = [a for a in articles if a["id"] not in connus]
    print(f"   {len(articles)} articles, dont {len(nouveaux)} nouveaux")

    limite = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    historique = [a for a in nouveaux + historique if a["date"] >= limite]
    sauve(F_ARTICLES, historique)

    idees = charge(F_IDEES, [])
    analyse = None
    if ia.available() and (nouveaux or historique):
        analyse = agents.analyste(nouveaux or historique[:40])
        if analyse:
            analyses = charge(F_ANALYSES, {})
            analyses[AUJ] = analyse
            sauve(F_ANALYSES, dict(sorted(analyses.items())[-120:]))
            nouvelles = agents.chercheur(analyse, idees)
            if nouvelles:
                idees = fusionne_idees(idees, nouvelles, agents.critique(nouvelles, analyse))
            if idees:
                strat = agents.stratege(idees[0], analyse)
                if strat:
                    idees[0]["strategie"] = strat
                    idees[0]["derniere_maj"] = AUJ
            sauve(F_IDEES, idees)

    md = rapport_markdown(nouveaux, analyse, idees)
    RAPPORTS.mkdir(exist_ok=True)
    (RAPPORTS / f"{AUJ}.md").write_text(md, encoding="utf-8")

    (SITE / "rapports").mkdir(parents=True, exist_ok=True)
    archives = sorted((p.stem for p in RAPPORTS.glob("*.md")), reverse=True)
    (SITE / "rapports" / f"{AUJ}.html").write_text(page_html(md, archives, "../"), encoding="utf-8")
    (SITE / "index.html").write_text(page_html(md, archives, ""), encoding="utf-8")
    (SITE / ".nojekyll").touch()
    print(f"✅ Rapport : zanzibar-veille/rapports/{AUJ}.md  +  docs/index.html")

    envoie_email(md)


if __name__ == "__main__":
    main()
