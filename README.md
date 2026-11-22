# VotreIAPro — le QG de tes agents IA entrepreneurs

Une application complète où une équipe de **8 agents IA** cherche les niches rentables, décide d'une offre en réunion, crée la page de vente avec **paiement Stripe**, prospecte des professionnels, rédige des emails persuasifs, prépare les campagnes de pub et **te rend compte**. Tu vois tout et tu donnes ton avis depuis ton back-office.

## L'équipe

| Agent | Rôle |
|---|---|
| 🧭 **Victor** | Directeur général : anime les réunions, tranche, te fait les points d'étape |
| 🔎 **Nora** | Recherche de niches et de produits sur Internet (sources citées) |
| 📣 **Léo** | Marketing et publicité (Google Ads, Meta, LinkedIn, SEO local) |
| ✉️ **Clara** | Copywriter : séquences d'emails personnalisées (premier contact + 2 relances) |
| 🎯 **Hugo** | Prospecteur : trouve des contacts professionnels **publics**, avec la source |
| 🤝 **Inès** | Commerciale : analyse les réponses, traite les objections, amène à l'achat |
| 🛠️ **Sam** | Crée les pages de vente et prépare la livraison |
| ⚖️ **Juliette** | Conformité : RGPD, prospection B2B, règles des professions ciblées |

## Ton espace fondateur (`/admin`)

- **Tableau de bord** : chiffre d'affaires, ventes, prospects, emails, réponses, avancement de la mission en direct, dernier point de Victor.
- **Parler aux agents** : un chat avec chaque agent. Il connaît l'état de l'entreprise et tient compte de tes consignes.
- **Questions des agents** : quand une décision dépend de toi, ils te la posent ici. Tes réponses passent avant tout le reste dans leur travail.
- **Réunions** : la transcription de chaque réunion, prise de parole par prise de parole. Tu peux convoquer une réunion sur le sujet de ton choix et donner ton avis.
- **Emails à valider** : tu relis, modifies, approuves ou rejettes avant envoi (tu peux aussi passer en envoi automatique).
- **Prospects**, **Offres & sites**, **Campagnes**, **Niches**, **Ventes & contacts**, **Journal**, **Paramètres**.

## Le cycle de travail

1. Nora étudie 3 à 5 niches sur Internet et les note sur 10.
2. **Réunion** : chaque agent donne son avis, puis Victor choisit **une** offre (prix de mise en place + abonnement mensuel).
3. Sam publie la page de vente sur `/offre/<nom>` avec le bouton de paiement Stripe.
4. Juliette vérifie la conformité, Léo prépare les campagnes de pub.
5. Hugo trouve des prospects, Clara rédige une séquence de 3 emails pour chacun.
6. Les emails approuvés partent (limite quotidienne, lien de désinscription, mentions légales).
7. Victor t'envoie un point d'étape. Aux cycles suivants, l'équipe tient une **réunion de pilotage** sur les chiffres et ajuste.

Avec l'**autopilote**, un cycle se lance tout seul toutes les `CYCLE_HOURS` heures.

## Démarrer en 3 étapes (sans rien de technique)

1. **Mettre le site en ligne** : sur [render.com](https://render.com), crée un compte, clique **New → Blueprint** et choisis ce dépôt. Render ne te demande qu'une chose : `ADMIN_PASSWORD`, le mot de passe de ton back-office (choisis-le).
2. **Ouvrir ton QG** : va sur `https://<ton-site>.onrender.com/admin`. Identifiant : ce que tu veux. Mot de passe : celui que tu viens de choisir.
3. **Coller tes clés** : **Paramètres → Connexions**. Chaque champ explique où trouver la clé : Anthropic pour les agents, Stripe pour le paiement, SMTP pour les emails. Clique **« Enregistrer les clés »**, puis **« Lancer un cycle complet »** depuis le tableau de bord.

Sans clé Anthropic, l'application tourne en **mode démo** : les réponses sont des exemples marqués `[DÉMO]`, et rien n'est envoyé.

### Pour les techniciens : lancer sur son ordinateur

Il faut Node.js 22.13 ou plus récent. Lance `npm install`, puis `ADMIN_PASSWORD=... npm start`, puis ouvre http://localhost:3000/admin. Les clés peuvent aussi être fournies en variables d'environnement (voir `.env.example`). Une clé saisie dans le back-office est prioritaire.

### Avant le premier envoi d'emails

1. **Paramètres** : raison sociale, SIRET, adresse, email de contact, ton nom. L'envoi est bloqué tant que ces champs sont vides : la loi impose de les afficher.
2. Utilise un **domaine d'envoi dédié** avec SPF, DKIM et DMARC configurés, pour protéger la réputation de ton domaine principal.
3. Commence avec une limite basse (20 à 30 emails par jour), puis augmente progressivement.
4. Active l'envoi dans **Paramètres → Envoi des emails**.

## Mise en ligne

Le fichier `render.yaml` permet de déployer sur [Render](https://render.com) en un clic (New → Blueprint). Il crée un disque persistant pour la base de données. N'importe quel hébergeur Node.js avec un disque persistant convient aussi (Railway, Fly.io, un VPS…).

## Les garde-fous (volontaires)

- **Pas de faux témoignages, faux chiffres ni fausse urgence.** On persuade par la valeur et la personnalisation.
- **Prospection B2B uniquement**, vers des adresses professionnelles publiques, avec un lien de désinscription dans chaque email. C'est ce qu'autorise la CNIL.
- **Validation humaine par défaut** des emails et des campagnes de pub. Aucun euro de publicité n'est dépensé sans toi.
- Les réponses des prospects arrivent dans **ta boîte mail** (adresse de contact). Colle-les dans **Prospects → Il a répondu** : Inès prépare la réponse.
- Les pages légales (`/mentions-legales`, `/cgv`, `/confidentialite`) sont des modèles. Fais-les relire avant d'encaisser de vrais clients.

## Structure

```
src/server.js        serveur web : site public, paiement, API du back-office, autopilote
src/orchestrator.js  travail des agents : cycles, réunions, chat, questions, réponses aux prospects
src/agents.js        personnalités et règles des agents
src/llm.js           accès à Claude (recherche web, reprise automatique, modèle de secours)
src/mailer.js        envoi des emails (limites, désinscription, mentions)
src/payments.js      Stripe Checkout et webhook
src/site.js          rendu des pages de vente et pages légales
public/admin/        interface du QG fondateur
STRATEGIE.md         la vision et la stratégie de départ
```
