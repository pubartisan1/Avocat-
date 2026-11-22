# 🌴 Veille Zanzibar IA — 100 % gratuite

Chaque jour, automatiquement, cette application :

1. **📡 collecte** toutes les actus sur Zanzibar : Google News en anglais, français et swahili, plus Reddit. Elle suit le tourisme, les hôtels, les habitants (protestations, terres, plages, pêcheurs), la politique, l'économie et l'investissement ;
2. **🧠 fait travailler une équipe de 4 agents IA** :
   - **Analyste** : résume la journée, signale les alertes et les tensions entre habitants et touristes ou hôtels ;
   - **Chercheur** : invente 5 nouvelles idées business à partir des actus ;
   - **Critique** : note chaque idée sans complaisance sur 6 critères (demande, coût, légalité pour un étranger, concurrence, acceptation sociale, gestion à distance) ;
   - **Stratège** : améliore chaque jour l'**idée championne** avec un plan sur 30 jours et un test à moins de 200 € ;
3. **🧾 publie un rapport** sur un site web gratuit (GitHub Pages), et par e-mail si tu le souhaites.

L'application garde une **mémoire** dans `data/idees.json`. Elle ne repropose donc jamais les mêmes idées, et le classement s'affine de jour en jour.

## ⚙️ Installation (une seule fois, environ 10 minutes, sans payer)

### 1. Obtenir une clé d'IA gratuite (une seule suffit)
| IA | Où | Nom du secret |
|---|---|---|
| **Google Gemini** (recommandé) | https://aistudio.google.com/apikey | `GEMINI_API_KEY` |
| Groq (Llama 3.3, très rapide) | https://console.groq.com/keys | `GROQ_API_KEY` |
| OpenRouter (modèles « free ») | https://openrouter.ai/keys | `OPENROUTER_API_KEY` |

Tu peux en mettre plusieurs : si l'une tombe en panne, l'application bascule sur la suivante. Sans aucune clé, elle fonctionne quand même en mode « collecte seule ».

### 2. Ajouter la clé dans GitHub
Sur la page du dépôt GitHub, va dans **Settings → Secrets and variables → Actions → New repository secret**. Pour le nom, mets par exemple `GEMINI_API_KEY` ; pour la valeur, colle ta clé.

### 3. (Optionnel) Recevoir le rapport par e-mail chaque matin
Ajoute 3 secrets :
- `SMTP_USER` : ton adresse Gmail ;
- `SMTP_PASSWORD` : un **mot de passe d'application** Gmail, à créer sur https://myaccount.google.com/apppasswords (il faut avoir activé la validation en 2 étapes) ;
- `EMAIL_TO` : l'adresse qui doit recevoir le rapport.

### 4. Activer le site web
Va dans **Settings → Pages → Source : « Deploy from a branch »**, puis choisis la branche `main` et le dossier `/docs`. Ton tableau de bord sera publié à l'adresse `https://<ton-pseudo>.github.io/<nom-du-dépôt>/`.

### 5. Lancer
Va dans **Actions → « Veille Zanzibar quotidienne » → Run workflow** pour un premier essai. Ensuite, la veille tourne **tous les jours à 8h17, heure de Zanzibar**, sans que tu aies à faire quoi que ce soit.

> Le lancement automatique ne fonctionne que sur la branche par défaut du dépôt (souvent `main`). Il faut donc fusionner cette branche dans `main`.

## 💻 Lancer sur ton ordinateur (optionnel)
```bash
pip install -r zanzibar-veille/requirements.txt
export GEMINI_API_KEY="ta-clé"          # ou bien : export OLLAMA_HOST=http://localhost:11434
python zanzibar-veille/veille.py
```
Avec [Ollama](https://ollama.com), l'IA tourne **sur ton PC**, gratuitement, sans clé et sans Internet pour l'IA.

## 🔧 Personnaliser
- **Mots-clés surveillés** : liste `REQUETES` dans `collecte.py`.
- **Consignes des agents** : `agents.py`. Tu peux y ajouter ton budget, tes compétences ou ta ville.
- **Modèle d'IA** : variables `GEMINI_MODEL`, `GROQ_MODEL`, `OPENROUTER_MODEL` et `OLLAMA_MODEL`.

## 📁 Fichiers
- `rapports/AAAA-MM-JJ.md` : le rapport de chaque jour ;
- `data/idees.json` : toutes les idées, avec leurs notes et le plan de la championne ;
- `data/articles.json` : les articles des 90 derniers jours ;
- `recherche-initiale/` : la première recherche approfondie (actualités et meilleure idée business).

⚠️ Les idées et analyses produites par l'IA sont des **pistes à vérifier** sur place et avec un juriste local avant tout investissement.
