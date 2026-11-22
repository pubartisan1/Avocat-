# Mettre ton QG en ligne gratuitement, pas à pas

Compte environ **20 minutes**. Tu n'as rien à installer sur ton ordinateur.

| Quoi | Où | Prix |
|---|---|---|
| L'application (site + QG + agents) | **Render** | Gratuit |
| La mémoire (prospects, réunions, ventes, clés) | **Turso** | Gratuit |
| Ton adresse (www.ton-domaine.fr) et tes emails | **IONOS** | Déjà payé |
| Le travail des agents | **Anthropic** | Payé à l'usage, quelques euros pour démarrer |

---

## Étape 1 : créer la mémoire (Turso), 5 min

1. Va sur **turso.tech** et clique **Sign up**. Le plus simple est de te connecter avec ton compte GitHub.
2. Clique **Create Database**. Nom : `qg`. Région : la plus proche de la France (Paris, ou Francfort à défaut). Valide.
3. Sur la page de ta base, copie l'**URL** (elle commence par `libsql://`). Colle-la dans un bloc-notes.
4. Clique **Create Token** (ou « Generate Token »), puis copie le jeton, une longue suite de caractères. Colle-le aussi dans ton bloc-notes.

## Étape 2 : mettre l'application en ligne (Render), 5 min

1. Va sur **render.com** et clique **Get Started**. Connecte-toi avec ton compte GitHub.
2. Clique **New +**, puis **Blueprint**.
3. Choisis le dépôt **Avocat-**. Comme branche, choisis `claude/ecommerce-ai-agents-app-9wg0p4`.
4. Render te demande 3 valeurs :
   - `ADMIN_PASSWORD` : invente le mot de passe de ton QG et note-le.
   - `TURSO_DATABASE_URL` : l'URL `libsql://…` de l'étape 1.
   - `TURSO_AUTH_TOKEN` : le jeton de l'étape 1.
5. Clique **Apply**. Attends 2 à 3 minutes. Render te donne une adresse du type `https://votreiapro-qg.onrender.com`.

## Étape 3 : ouvrir ton QG et coller ta clé Anthropic, 2 min

1. Ouvre `https://votreiapro-qg.onrender.com/admin`. Identifiant : ce que tu veux. Mot de passe : ton `ADMIN_PASSWORD`.
2. Va dans **Paramètres**. Dans **« 1. Les agents (Claude) »**, colle ta clé `sk-ant-…`, puis clique **Enregistrer les clés**.
3. Retourne au **Tableau de bord** et clique **🚀 Lancer un cycle complet**. L'équipe se met au travail.

## Étape 4 : garder le site éveillé (gratuit), 3 min

Sur l'offre gratuite, Render met le site en veille après 15 minutes sans visite. Pendant la veille, l'autopilote ne tourne pas. Pour l'en empêcher :

1. Va sur **cron-job.org** et crée un compte gratuit.
2. Clique **Create cronjob**. Adresse : `https://votreiapro-qg.onrender.com/sante`. Fréquence : **toutes les 10 minutes**. Enregistre.

C'est tout. Les 750 heures gratuites par mois de Render suffisent pour un site allumé en permanence.

## Étape 5 (facultative) : ton adresse IONOS www.ton-domaine.fr

1. Sur **Render** : ouvre ton service, puis **Settings → Custom Domains → Add**. Tape `www.ton-domaine.fr`. Render t'indique une valeur à recopier, du type `votreiapro-qg.onrender.com`.
2. Sur **IONOS** : va dans **Domaines & SSL**, clique sur ton domaine, puis **DNS**, puis **Ajouter un enregistrement**. Choisis le type **CNAME**, nom d'hôte `www`, et colle la valeur donnée par Render. Enregistre. Si un enregistrement `www` existe déjà, modifie-le au lieu d'en créer un nouveau.
3. Attends de quelques minutes à quelques heures. Render passe au vert et active le cadenas HTTPS tout seul.
4. Dans ton QG, va dans **Paramètres → Adresse de ton site** et mets `https://www.ton-domaine.fr`.

## Étape 6 (quand tu es prêt) : emails et paiement

**Emails avec ton adresse IONOS** : dans IONOS, crée une adresse (par exemple `contact@ton-domaine.fr`) si tu n'en as pas. Ensuite, dans **Paramètres** de ton QG, partie « 3. L'envoi d'emails », remplis :
- Serveur : `smtp.ionos.fr`
- Port : `587`
- Identifiant : ton adresse complète
- Mot de passe : celui de cette adresse
- Expéditeur : `Ton Prénom – VotreIAPro <contact@ton-domaine.fr>`

Conseil : IONOS limite le nombre d'emails envoyés par jour. Commence à 20 ou 30 par jour.

**Paiement avec Stripe** : crée un compte sur **stripe.com**. Ensuite, suis les explications affichées dans **Paramètres → « 2. Le paiement »**.

---

### En cas de souci

- **Le QG affiche une erreur au démarrage** : vérifie dans Render (onglet **Environment**) que l'URL et le jeton Turso sont bien collés, sans espace en trop.
- **La première visite est lente** : c'est le réveil du serveur gratuit (environ 30 secondes). L'étape 4 l'évite.
- **Une autre question** : pose-la dans ton QG, dans « Parler aux agents », ou demande-moi.
