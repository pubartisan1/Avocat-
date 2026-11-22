"""L'équipe d'agents IA qui travaille chaque jour.

  1. Agent Analyste   : lit toutes les actus du jour et en tire l'essentiel.
  2. Agent Chercheur  : invente de nouvelles idées business à partir des actus.
  3. Agent Critique   : note et vérifie chaque idée sans complaisance.
  4. Agent Stratège   : améliore chaque jour l'idée championne (plan d'action).
"""

from __future__ import annotations

import json

import ia

CONTEXTE = (
    "Tu travailles pour un entrepreneur francophone qui s'intéresse à Zanzibar (Tanzanie). "
    "Tu es précis, factuel et tu n'inventes jamais de faits : si une info n'est pas dans les "
    "articles fournis, tu le dis. Tu écris en français. "
    "Règles connues à respecter : les activités de tour-opérateur et de transfert en bateau sont "
    "réservées aux Zanzibarites (loi tourisme 2009) et les montages avec prête-noms locaux sont "
    "poursuivis depuis janvier 2026 ; les gros projets étrangers passent par la ZIPA (seuils "
    "d'investissement minimum) ; le gouvernement exige l'embauche prioritaire de locaux."
)


def _liste_articles(articles: list[dict], maxi: int = 70) -> str:
    lignes = []
    for i, a in enumerate(articles[:maxi], 1):
        lignes.append(
            f"[{i}] ({a['categorie']}) {a['date'][:10]} — {a['titre']} — {a['source']}\n"
            f"    {a['resume'][:280]}\n    {a['lien']}"
        )
    return "\n".join(lignes)


def analyste(articles: list[dict]) -> dict | None:
    print("🧠 Agent Analyste…")
    return ia.ask_json(
        CONTEXTE + " Tu es l'analyste de veille.",
        "Voici les actualités collectées aujourd'hui sur Zanzibar :\n\n"
        + _liste_articles(articles)
        + "\n\nProduis ce JSON :\n"
        '{"resume": "synthèse du jour en 5-10 phrases (markdown autorisé)",\n'
        ' "tourisme": ["fait important + [n° article]", ...],\n'
        ' "tensions": ["habitants vs touristes/hôtels, terres, plages, protestations… + [n°]", ...],\n'
        ' "politique_economie": ["…", ...],\n'
        ' "alertes": ["ce qui demande une attention immédiate", ...],\n'
        ' "signaux_business": ["besoin non satisfait, problème, tendance exploitable + [n°]", ...]}',
    )


def chercheur(analyse: dict, idees_existantes: list[dict], n: int = 5) -> list[dict]:
    print("💡 Agent Chercheur…")
    deja = "\n".join(f"- {i['titre']} (score {i.get('score_total', '?')})" for i in idees_existantes[:30])
    res = ia.ask_json(
        CONTEXTE + " Tu es un chercheur d'opportunités business créatif mais réaliste.",
        f"Analyse de veille du jour :\n{json.dumps(analyse, ensure_ascii=False, indent=1)}\n\n"
        f"Idées DÉJÀ étudiées (ne les répète pas, mais tu peux proposer une variante nettement meilleure) :\n{deja or '- aucune'}\n\n"
        f"Propose {n} NOUVELLES idées de business liées à Zanzibar, réalisables par un étranger "
        "avec un budget modeste, socialement acceptables (idéalement bénéfiques aux habitants), "
        "et appuyées sur les signaux du jour. JSON : liste d'objets\n"
        '[{"titre": "", "concept": "", "cible": "", "pourquoi_maintenant": "", '
        '"budget_eur": "fourchette", "modele_revenus": "", "premiers_pas": ["", ""], "risques": [""]}]',
    )
    return res if isinstance(res, list) else []


CRITERES = ["demande", "cout_faible", "faisabilite_legale", "faible_concurrence", "acceptation_sociale", "gerable_a_distance"]


def critique(idees: list[dict], analyse: dict) -> list[dict]:
    print("🔍 Agent Critique…")
    res = ia.ask_json(
        CONTEXTE
        + " Tu es un investisseur très exigeant. Tu cherches les failles : concurrence existante, "
        "règles ZIPA / permis de travail / licences pour étrangers, saisonnalité, rejet par la population, "
        "marges irréalistes. Tu notes sévèrement : 8+ seulement si c'est vraiment solide.",
        f"Contexte du jour :\n{json.dumps(analyse, ensure_ascii=False)[:4000]}\n\n"
        f"Idées à évaluer :\n{json.dumps(idees, ensure_ascii=False, indent=1)}\n\n"
        f"Pour CHAQUE idée (même ordre), donne une note de 1 à 10 sur : {', '.join(CRITERES)}. JSON :\n"
        '[{"titre": "", "notes": {"demande": 0, ...}, "verdict": "GO / À CREUSER / NON", '
        '"faiblesses": [""], "a_verifier_sur_place": [""], "amelioration": "comment rendre l\'idée meilleure"}]',
    )
    return res if isinstance(res, list) else []


def stratege(champion: dict, analyse: dict) -> dict | None:
    print("♟️  Agent Stratège…")
    return ia.ask_json(
        CONTEXTE + " Tu es un stratège qui affine jour après jour la meilleure idée jusqu'à ce qu'elle marche.",
        f"Idée championne actuelle :\n{json.dumps(champion, ensure_ascii=False, indent=1)}\n\n"
        f"Actus du jour :\n{json.dumps(analyse, ensure_ascii=False)[:4000]}\n\n"
        "Améliore l'idée en tenant compte des actus. JSON :\n"
        '{"concept": "version améliorée", "impact_actus_du_jour": "ce qui change aujourd\'hui (ou \'rien\')", '
        '"plan_30_jours": ["semaine 1 : …", "…"], "test_rapide_a_faible_cout": "comment valider la demande pour < 200 €", '
        '"indicateurs_de_succes": [""], "risques": [""]}',
    )
