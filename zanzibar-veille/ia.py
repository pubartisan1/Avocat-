"""Couche IA gratuite : essaie plusieurs fournisseurs gratuits dans l'ordre.

Fournisseurs supportés (il suffit d'en configurer UN seul) :
  - Google Gemini   : variable GEMINI_API_KEY      (gratuit sur https://aistudio.google.com/apikey)
  - Groq            : variable GROQ_API_KEY        (gratuit sur https://console.groq.com/keys)
  - OpenRouter      : variable OPENROUTER_API_KEY  (modèles ":free" sur https://openrouter.ai/keys)
  - Ollama (local)  : variable OLLAMA_HOST         (ex. http://localhost:11434, 100 % gratuit, sur ton PC)

Si aucun n'est configuré, l'application fonctionne quand même en mode « sans IA »
(collecte + tri par mots-clés).
"""

from __future__ import annotations

import json
import os
import re
import time

import requests

TIMEOUT = 120


def _gemini(system: str, prompt: str) -> str:
    key = os.environ["GEMINI_API_KEY"]
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7},
    }
    r = requests.post(url, params={"key": key}, json=body, timeout=TIMEOUT)
    r.raise_for_status()
    parts = r.json()["candidates"][0]["content"]["parts"]
    return "".join(p.get("text", "") for p in parts)


def _openai_compatible(base_url: str, key: str, model: str, system: str, prompt: str) -> str:
    r = requests.post(
        f"{base_url}/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "temperature": 0.7,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _groq(system: str, prompt: str) -> str:
    return _openai_compatible(
        "https://api.groq.com/openai/v1",
        os.environ["GROQ_API_KEY"],
        os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
        system,
        prompt,
    )


def _openrouter(system: str, prompt: str) -> str:
    return _openai_compatible(
        "https://openrouter.ai/api/v1",
        os.environ["OPENROUTER_API_KEY"],
        os.environ.get("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free"),
        system,
        prompt,
    )


def _ollama(system: str, prompt: str) -> str:
    host = os.environ["OLLAMA_HOST"].rstrip("/")
    r = requests.post(
        f"{host}/api/chat",
        json={
            "model": os.environ.get("OLLAMA_MODEL", "llama3.1"),
            "stream": False,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=600,
    )
    r.raise_for_status()
    return r.json()["message"]["content"]


PROVIDERS = [
    ("GEMINI_API_KEY", "Gemini", _gemini),
    ("GROQ_API_KEY", "Groq", _groq),
    ("OPENROUTER_API_KEY", "OpenRouter", _openrouter),
    ("OLLAMA_HOST", "Ollama", _ollama),
]


def available() -> list[str]:
    return [name for env, name, _ in PROVIDERS if os.environ.get(env)]


def ask(system: str, prompt: str) -> str | None:
    """Pose une question à la première IA gratuite qui répond. None si aucune."""
    for env, name, fn in PROVIDERS:
        if not os.environ.get(env):
            continue
        for attempt in range(3):
            try:
                text = fn(system, prompt)
                if text and text.strip():
                    print(f"   ✓ réponse de {name}")
                    return text.strip()
            except Exception as exc:  # noqa: BLE001 - on veut basculer vers le suivant
                print(f"   ⚠ {name} essai {attempt + 1} échoué : {exc}")
                time.sleep(5 * (attempt + 1))
    return None


def ask_json(system: str, prompt: str):
    """Comme ask() mais extrait et décode le JSON de la réponse."""
    text = ask(system + "\nRéponds UNIQUEMENT avec du JSON valide, sans texte autour.", prompt)
    if not text:
        return None
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    for candidate in (text, _first_json_block(text)):
        if not candidate:
            continue
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    print("   ⚠ JSON illisible renvoyé par l'IA")
    return None


def _first_json_block(text: str) -> str | None:
    starts = [i for i in (text.find("["), text.find("{")) if i != -1]
    if not starts:
        return None
    start = min(starts)
    end = max(text.rfind("]"), text.rfind("}"))
    return text[start : end + 1] if end > start else None
