"""Collecte des actualités sur Zanzibar (flux RSS gratuits, sans clé)."""

from __future__ import annotations

import hashlib
import html
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import quote_plus

import requests

UA = {"User-Agent": "Mozilla/5.0 (compatible; ZanzibarVeille/1.0)"}

# (requête, langue) -> Google News RSS. "when:3d" = 3 derniers jours.
REQUETES = [
    ("Zanzibar tourism", "en"),
    ("Zanzibar hotel", "en"),
    ("Zanzibar protest OR residents OR villagers OR eviction OR land dispute", "en"),
    ("Zanzibar investment OR business OR ZIPA", "en"),
    ("Zanzibar government OR election OR Mwinyi", "en"),
    ("Zanzibar beach OR fishermen OR seaweed", "en"),
    ("Zanzibar tourisme", "fr"),
    ("Zanzibar", "fr"),
    ("Zanzibar utalii", "sw"),
    ("Zanzibar wananchi OR hoteli OR ardhi", "sw"),
]

EDITIONS = {
    "en": "hl=en&gl=TZ&ceid=TZ:en",
    "fr": "hl=fr&gl=FR&ceid=FR:fr",
    "sw": "hl=sw&gl=TZ&ceid=TZ:sw",
}

FLUX_DIRECTS = [
    # Forums / communautés (peuvent parfois bloquer, c'est géré)
    ("Reddit r/zanzibar", "https://www.reddit.com/r/zanzibar/new/.rss"),
    ("Reddit r/tanzania", "https://www.reddit.com/r/tanzania/search.rss?q=zanzibar&restrict_sr=1&sort=new"),
]

CATEGORIES = {
    "tensions": [
        "protest", "resident", "villager", "eviction", "evict", "land", "dispute", "clash",
        "anger", "complain", "beach access", "fishermen", "culture", "dress", "conflict",
        "manifest", "habitant", "colère", "expuls", "wananchi", "ardhi", "mgogoro", "maandamano",
    ],
    "politique": [
        "election", "government", "minister", "mwinyi", "police", "arrest", "opposition",
        "law", "ban", "regulation", "gouvernement", "élection", "serikali", "sheria",
    ],
    "business": [
        "invest", "business", "startup", "zipa", "project", "million", "billion", "deal",
        "company", "market", "price", "economy", "airline", "flight", "entreprise", "uwekezaji",
    ],
    "tourisme": [
        "touris", "hotel", "resort", "visitor", "arrival", "holiday", "travel", "beach",
        "stone town", "nungwi", "paje", "kendwa", "utalii", "hoteli", "watalii", "voyage",
    ],
}


def _txt(el, *tags):
    for t in tags:
        found = el.find(t)
        if found is not None:
            return (found.text or found.get("href") or "").strip()
    return ""


def _nettoie(s: str) -> str:
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    return re.sub(r"\s+", " ", s).strip()


def _date(s: str) -> str:
    if not s:
        return datetime.now(timezone.utc).isoformat()
    try:
        return parsedate_to_datetime(s).astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError):
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
        except ValueError:
            return datetime.now(timezone.utc).isoformat()


def _parse_flux(xml_text: str, source_defaut: str):
    root = ET.fromstring(xml_text)
    atom = "{http://www.w3.org/2005/Atom}"
    items = root.findall(".//item") or root.findall(f".//{atom}entry")
    for it in items:
        titre = _nettoie(_txt(it, "title", f"{atom}title"))
        lien = _txt(it, "link")
        if not lien:
            l = it.find(f"{atom}link")
            lien = l.get("href", "") if l is not None else ""
        resume = _nettoie(_txt(it, "description", f"{atom}content", f"{atom}summary"))[:500]
        source = _nettoie(_txt(it, "source")) or source_defaut
        date = _date(_txt(it, "pubDate", f"{atom}updated", f"{atom}published"))
        if titre and lien:
            yield {"titre": titre, "lien": lien, "resume": resume, "source": source, "date": date}


def categorise(article: dict) -> str:
    texte = f"{article['titre']} {article['resume']}".lower()
    scores = {c: sum(texte.count(m) for m in mots) for c, mots in CATEGORIES.items()}
    meilleure = max(scores, key=scores.get)
    return meilleure if scores[meilleure] else "autre"


def identifiant(article: dict) -> str:
    cle = re.sub(r"\W+", "", article["titre"].lower())[:120]
    return hashlib.sha1(cle.encode()).hexdigest()[:16]


def collecter() -> list[dict]:
    urls = [
        (f"Google News ({lang})",
         f"https://news.google.com/rss/search?q={quote_plus(q + ' when:3d')}&{EDITIONS[lang]}")
        for q, lang in REQUETES
    ] + FLUX_DIRECTS

    vus, articles = set(), []
    for nom, url in urls:
        try:
            r = requests.get(url, headers=UA, timeout=30)
            r.raise_for_status()
            n = 0
            for a in _parse_flux(r.text, nom):
                if "zanzibar" not in (a["titre"] + a["resume"]).lower() and "Reddit r/zanzibar" != nom:
                    continue
                a["id"] = identifiant(a)
                if a["id"] in vus:
                    continue
                vus.add(a["id"])
                a["categorie"] = categorise(a)
                articles.append(a)
                n += 1
            print(f"   {nom:<22} +{n}")
        except Exception as exc:  # noqa: BLE001
            print(f"   {nom:<22} ⚠ {exc}")
    articles.sort(key=lambda a: a["date"], reverse=True)
    return articles
