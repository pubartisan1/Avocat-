// Réponses d'exemple utilisées UNIQUEMENT en mode démo (sans clé API).
// Elles servent à montrer le fonctionnement de l'interface ; ce ne sont pas des résultats réels.

export const MOCKS = {
  generic: { note: '[DÉMO] Ajoutez ANTHROPIC_API_KEY pour que les agents travaillent réellement.' },

  niches: {
    niches: [
      {
        name: 'Avocats indépendants sans site performant', sector: 'Juridique',
        problem: "Beaucoup de cabinets individuels ont un site daté ou inexistant et perdent des clients au profit de cabinets mieux référencés et de plateformes de mise en relation.",
        offer_idea: 'Site de cabinet clé en main + assistant IA de pré-qualification des demandes + prise de RDV en ligne, abonnement mensuel.',
        audience: '[DÉMO] Plusieurs dizaines de milliers d’avocats en France, dont une forte part exerce seule.',
        willingness_to_pay: 'Élevée : honoraires élevés, un seul dossier gagné rentabilise l’abonnement.',
        competition: 'Agences web généralistes, plateformes de mise en relation. Peu d’offres spécialisées clé en main.',
        score: 8.6, reasoning: '[DÉMO] Douleur forte, budget réel, cible joignable par email professionnel public.',
      },
      {
        name: 'Artisans du bâtiment (plombiers, électriciens) — génération de demandes', sector: 'Artisanat',
        problem: 'Dépendance aux plateformes de leads payants, peu de présence Google, devis non relancés.',
        offer_idea: 'Site + fiche Google optimisée + relance automatique des devis.',
        audience: '[DÉMO] Très grand nombre d’entreprises artisanales.', willingness_to_pay: 'Moyenne à élevée si retour rapide.',
        competition: 'Forte (agences locales), mais beaucoup d’artisans mal servis.', score: 7.9,
        reasoning: '[DÉMO] Volume énorme, cycle de vente court, mais budget plus sensible.',
      },
      {
        name: 'Médecins et paramédicaux — secrétariat et contenus', sector: 'Santé',
        problem: 'Surcharge administrative, appels non traités, information patient répétitive.',
        offer_idea: 'Page praticien + FAQ patient + réponses automatiques aux questions administratives.',
        audience: '[DÉMO] Large.', willingness_to_pay: 'Moyenne, solutions installées existantes.',
        competition: 'Très forte (plateformes de prise de RDV établies).', score: 6.4,
        reasoning: '[DÉMO] Concurrence dominante et règles déontologiques strictes sur la publicité.',
      },
    ],
    questions_fondateur: [],
  },

  meetingLine: (agent) => `[DÉMO] (${agent}) Mon avis : on attaque la niche des avocats indépendants. Problème douloureux, budget réel, et on peut livrer vite. Je propose de tester l'offre sur 50 cabinets cette semaine et de mesurer le taux de réponse.`,

  meetingDecision: {
    summary: "[DÉMO] L'équipe s'accorde pour lancer une offre « Cabinet Connecté » destinée aux avocats indépendants.",
    decisions: ['Lancer l’offre Cabinet Connecté', 'Prospecter 15 cabinets par cycle', 'Tester 2 objets d’email'],
    product: {
      name: 'Cabinet Connecté', niche: 'Avocats indépendants', target: 'Avocats exerçant seuls ou en petit cabinet (1 à 3 associés)',
      tagline: 'Votre cabinet trouvé, compris et contacté — sans y passer vos soirées.',
      description: 'Un site professionnel conforme à la déontologie, un assistant IA qui pré-qualifie les demandes 24h/24 et une prise de rendez-vous en ligne, livrés en 7 jours et maintenus chaque mois.',
      price_setup: 490, price_monthly: 79,
      deliverables: ['Site vitrine 5 pages conforme', 'Assistant IA de pré-qualification', 'Prise de RDV en ligne', 'Fiche Google optimisée', 'Maintenance et mises à jour'],
    },
    questions_fondateur: [],
  },

  landing: {
    hero_title: 'Votre cabinet mérite d’être trouvé avant vos confrères.',
    hero_subtitle: 'Site professionnel conforme, assistant IA qui trie les demandes 24h/24 et prise de rendez-vous en ligne — livré en 7 jours.',
    cta: 'Lancer mon cabinet connecté',
    problems: ['Des demandes perdues le soir et le week-end', 'Un site daté qui ne rassure pas', 'Des heures passées à répondre aux mêmes questions'],
    benefits: [
      { title: 'Plus de demandes qualifiées', text: 'Vos futurs clients décrivent leur situation avant le premier appel.' },
      { title: 'Du temps récupéré', text: 'L’assistant répond aux questions pratiques (honoraires, pièces à fournir, délais).' },
      { title: 'Une image irréprochable', text: 'Un site sobre, rapide et conforme aux règles de communication de la profession.' },
    ],
    process: [{ step: 'Appel de cadrage (20 min)', text: 'On comprend vos domaines et votre clientèle.' }, { step: 'Création (7 jours)', text: 'On rédige, on construit, vous validez.' }, { step: 'Mise en ligne & suivi', text: 'Maintenance, sécurité et améliorations chaque mois.' }],
    faq: [{ q: 'Est-ce conforme aux règles de la profession ?', a: 'Oui, les contenus respectent les principes de dignité, de loyauté et d’information de la communication des avocats.' }, { q: 'Puis-je résilier ?', a: 'Oui, l’abonnement est sans engagement après les 3 premiers mois.' }],
    guarantee: 'Si le site n’est pas en ligne sous 15 jours ouvrés après réception de vos éléments, les frais de création vous sont remboursés.',
  },

  campaign: {
    campaigns: [
      { channel: 'Google Ads', name: 'Recherche — « site avocat »', budget: '150 €/mois', plan: { mots_cles: ['création site avocat', 'site internet cabinet avocat'], annonces: ['Site d’avocat livré en 7 jours — conforme et efficace'], kpi: 'CPL cible < 40 €' } },
      { channel: 'LinkedIn', name: 'Contenu + messages ciblés avocats', budget: '0 € (organique)', plan: { rythme: '3 posts/semaine', angles: ['Avant/après de sites de cabinets', 'Les demandes perdues le week-end'] } },
    ],
  },

  compliance: { verdict: 'OK avec corrections', points: ['[DÉMO] Compléter les mentions légales (raison sociale, SIRET, adresse).', '[DÉMO] Ajouter un lien de désinscription dans chaque email (fait automatiquement).'], corrections: [] },

  prospects: {
    prospects: [
      { name: 'Maître Exemple Un', company: 'Cabinet Exemple Un', role: 'Avocate', email: 'contact@exemple-un.example', city: 'Lyon', website: 'https://exemple-un.example', source_url: 'https://exemple-un.example/contact', personalization: '[DÉMO] Spécialisée en droit de la famille, site sans prise de RDV en ligne.' },
      { name: 'Maître Exemple Deux', company: 'Cabinet Exemple Deux', role: 'Avocat', email: 'cabinet@exemple-deux.example', city: 'Bordeaux', website: '', source_url: 'https://annuaire.example/exemple-deux', personalization: '[DÉMO] Pas de site internet trouvé, uniquement une fiche annuaire.' },
    ],
  },

  emails: {
    emails: [
      { step: 1, subject: 'Vos demandes du week-end, Maître', body: 'Bonjour Maître,\n\n[DÉMO] J’ai vu que votre cabinet ne propose pas encore de prise de rendez-vous en ligne...\n\nSeriez-vous ouvert(e) à un échange de 15 minutes cette semaine ?\n\nBien à vous,' },
      { step: 2, subject: 'Re: Vos demandes du week-end', body: 'Bonjour Maître,\n\n[DÉMO] Je me permets de revenir vers vous...' },
      { step: 3, subject: 'Je clôture ce sujet ?', body: 'Bonjour Maître,\n\n[DÉMO] Dernier message de ma part...' },
    ],
  },

  report: "[DÉMO] Résumé de Victor : l'équipe a analysé 3 niches, choisi les avocats indépendants, créé l'offre « Cabinet Connecté » et sa page de vente, préparé une campagne et des emails. Pour passer en réel : ajoutez la clé Anthropic, Stripe et votre SMTP dans les paramètres, puis complétez vos informations légales.",

  chat: (name) => `[DÉMO] Bonjour, ici ${name}. Je suis en mode démonstration : ajoutez ANTHROPIC_API_KEY pour que je puisse vraiment analyser et vous répondre.`,
};
