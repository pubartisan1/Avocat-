// Orchestrateur : fait travailler l'équipe d'agents, organise les réunions et rend compte au fondateur.
import { AGENTS, systemFor } from './agents.js';
import { ask, askJSON, hasLLM } from './llm.js';
import { MOCKS } from './mocks.js';
import { all, get, insert, update, run, getSettings, log, parseJSON, baseUrl } from './db.js';
import crypto from 'node:crypto';

// ------------------------------------------------------------------ contexte partagé
export async function companyContext() {
  const s = getSettings();
  const products = await all("SELECT id, name, niche, price_setup, price_monthly, status FROM products ORDER BY id DESC LIMIT 5");
  const niches = await all('SELECT name, score FROM niches ORDER BY id DESC LIMIT 6');
  const stats = {
    prospects: (await get('SELECT COUNT(*) n FROM prospects WHERE demo = 0')).n,
    contactes: (await get("SELECT COUNT(*) n FROM prospects WHERE status != 'nouveau' AND demo = 0")).n,
    reponses: (await get("SELECT COUNT(*) n FROM prospects WHERE status IN ('a répondu','rdv','client')")).n,
    emails_envoyes: (await get("SELECT COUNT(*) n FROM emails WHERE status = 'envoyé'")).n,
    emails_a_valider: (await get("SELECT COUNT(*) n FROM emails WHERE status = 'brouillon'")).n,
    ventes: await get("SELECT COUNT(*) n, COALESCE(SUM(amount),0) total FROM orders WHERE status = 'payé'"),
    leads_site: (await get('SELECT COUNT(*) n FROM leads')).n,
  };
  const founderNotes = [
    ...(await all("SELECT 'Réponse du fondateur à « ' || question || ' » : ' || answer AS t FROM questions WHERE status = 'répondue' ORDER BY id DESC LIMIT 8")),
    ...(await all("SELECT 'Avis du fondateur sur la réunion « ' || topic || ' » : ' || founder_comment AS t FROM meetings WHERE founder_comment IS NOT NULL AND founder_comment != '' ORDER BY id DESC LIMIT 5")),
    ...(await all("SELECT 'Message du fondateur : ' || text AS t FROM messages WHERE sender = 'fondateur' ORDER BY id DESC LIMIT 6")),
  ].map((r) => `- ${r.t}`).join('\n');

  return `CONTEXTE DE L'ENTREPRISE (au ${new Date().toLocaleDateString('fr-FR')})
Marque : ${s.brand_name}. Fondateur : ${s.founder_name || 'non renseigné'}.
Vision du fondateur : ${s.founder_vision}
Budget publicitaire mensuel autorisé : ${s.ads_budget_month} €.
Offres existantes : ${products.length ? products.map((p) => `${p.name} (${p.niche}, ${p.price_setup} € + ${p.price_monthly} €/mois, ${p.status})`).join(' ; ') : 'aucune'}.
Niches déjà étudiées : ${niches.length ? niches.map((n) => `${n.name} (${n.score}/10)`).join(' ; ') : 'aucune'}.
Chiffres : ${JSON.stringify(stats)}
Consignes et avis du fondateur (PRIORITAIRES) :
${founderNotes || '- aucun pour l’instant'}`;
}

async function addQuestions(agentId, questions, context = '') {
  for (const q of questions || []) {
    const text = typeof q === 'string' ? q : q?.question;
    if (!text) continue;
    if (await get("SELECT id FROM questions WHERE question = ? AND status = 'en attente'", text)) continue;
    await insert('questions', { agent: agentId, question: text, context });
    log(agentId, 'question', `❓ Question pour le fondateur`, text);
  }
}

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// ------------------------------------------------------------------ étapes de travail
export async function researchNiches(focus = '') {
  log('nora', 'recherche', 'Recherche de niches en cours…', focus);
  const { data, sources } = await askJSON({
    system: systemFor('nora'),
    webSearch: true, maxSearches: 8, effort: 'high',
    mock: MOCKS.niches,
    prompt: `${await companyContext()}

MISSION : trouve les 3 à 5 meilleures niches où notre entreprise peut vendre RAPIDEMENT un service numérique (site, automatisation, assistant IA, contenus, génération de clients...) à des professionnels (avocats, artisans, médecins, ou autre métier si plus prometteur). ${focus ? `Orientation demandée : ${focus}.` : ''}
Fais de vraies recherches sur Internet : taille de la cible en France, prix pratiqués par les concurrents, offres qui marchent, entrepreneurs qui ont réussi dans cette niche et comment, signaux de demande.
Note chaque niche sur 10 (douleur × capacité à payer × facilité à joindre la cible × rapidité de livraison × concurrence).

JSON attendu : {"niches":[{"name":"","sector":"","problem":"","offer_idea":"","audience":"","willingness_to_pay":"","competition":"","score":0,"reasoning":"","sources":["url"]}],"questions_fondateur":["question si besoin"]}`,
  });
  const ids = [];
  for (const n of data.niches || []) {
    ids.push(await insert('niches', { ...pick(n, ['name', 'sector', 'problem', 'offer_idea', 'audience', 'willingness_to_pay', 'competition', 'reasoning']), score: Number(n.score) || 0, sources: n.sources?.length ? n.sources : sources.slice(0, 6).map((s) => s.url) }));
  }
  await addQuestions('nora', data.questions_fondateur, 'Recherche de niches');
  log('nora', 'recherche', `${ids.length} niches analysées`, (data.niches || []).map((n) => `${n.name} — ${n.score}/10`).join('\n'));
  return ids;
}

/**
 * Réunion d'équipe : chaque participant s'exprime à tour de rôle (en tenant compte de ce qui a été dit),
 * puis Victor conclut avec des décisions.
 */
export async function holdMeeting(topic, { participants = ['nora', 'leo', 'clara', 'hugo', 'ines', 'sam', 'juliette'], expectProduct = false, extra = '' } = {}) {
  const meetingId = await insert('meetings', { topic });
  log('victor', 'réunion', `Réunion ouverte : ${topic}`);
  const transcript = [];
  const save = () => update('meetings', meetingId, { transcript });
  const ctx = `${await companyContext()}\n${extra}`;

  const open = await ask({
    system: systemFor('victor'), effort: 'medium', maxTokens: 4000,
    mock: `[DÉMO] Bonjour à tous. Ordre du jour : ${topic}. Je veux des propositions concrètes et chiffrées.`,
    prompt: `${ctx}\n\nTu ouvres une réunion d'équipe. Sujet : « ${topic} ». En 3 à 5 phrases, cadre l'objectif, ce que tu attends de chacun et le critère de décision.`,
  });
  transcript.push({ agent: 'victor', text: open.text }); await save();

  for (const id of participants) {
    const said = transcript.map((t) => `${AGENTS[t.agent].name} (${AGENTS[t.agent].role}) : ${t.text}`).join('\n\n');
    const r = await ask({
      system: systemFor(id), effort: 'medium', maxTokens: 4000,
      mock: MOCKS.meetingLine(AGENTS[id].name),
      prompt: `${ctx}\n\nRÉUNION — sujet : « ${topic} »\nCe qui a été dit :\n${said}\n\nÀ toi (${AGENTS[id].name}, ${AGENTS[id].role}). Apporte ton expertise en 4 à 8 phrases : propositions concrètes, chiffres, risques, désaccords argumentés si nécessaire. Ne répète pas les autres.`,
    });
    transcript.push({ agent: id, text: r.text }); await save();
  }

  const said = transcript.map((t) => `${AGENTS[t.agent].name} : ${t.text}`).join('\n\n');
  const productSchema = expectProduct
    ? `,"product":{"name":"","niche":"","target":"","tagline":"","description":"","price_setup":0,"price_monthly":0,"deliverables":[""]}`
    : '';
  const { data } = await askJSON({
    system: systemFor('victor'), effort: 'high', maxTokens: 8000,
    mock: MOCKS.meetingDecision,
    prompt: `${ctx}\n\nRÉUNION — sujet : « ${topic} »\n${said}\n\nTu conclus la réunion. Tranche, décide, attribue les actions.${expectProduct ? ' Tu DOIS choisir UNE offre précise à lancer maintenant (service que l’équipe peut réellement livrer), avec un prix réaliste.' : ''}
JSON attendu : {"conclusion":"ta prise de parole finale (3-6 phrases)","summary":"résumé de la réunion pour le fondateur","decisions":["décision — responsable"]${productSchema},"questions_fondateur":["question si une décision dépend du fondateur"]}`,
  });
  transcript.push({ agent: 'victor', text: data.conclusion || data.summary });
  await update('meetings', meetingId, { transcript, summary: data.summary, decisions: data.decisions || [], status: 'terminée' });
  await addQuestions('victor', data.questions_fondateur, `Réunion : ${topic}`);
  log('victor', 'réunion', `Réunion terminée : ${topic}`, data.summary);
  return { meetingId, data };
}

export async function createProduct(p, meetingId) {
  let slug = slugify(p.name || 'offre');
  if (await get('SELECT id FROM products WHERE slug = ?', slug)) slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
  const id = await insert('products', {
    slug, name: p.name, niche: p.niche, target: p.target, tagline: p.tagline, description: p.description,
    price_setup: Number(p.price_setup) || 0, price_monthly: Number(p.price_monthly) || 0,
    deliverables: p.deliverables || [], meeting_id: meetingId,
  });
  log('victor', 'produit', `Nouvelle offre décidée : ${p.name}`, `${p.price_setup} € + ${p.price_monthly} €/mois — ${p.target}`);
  return id;
}

export async function buildLanding(productId) {
  const p = await get('SELECT * FROM products WHERE id = ?', productId);
  log('sam', 'site', `Création de la page de vente « ${p.name} »…`);
  const { data } = await askJSON({
    system: systemFor('sam'), effort: 'high',
    mock: MOCKS.landing,
    prompt: `${await companyContext()}\n\nOFFRE : ${JSON.stringify(pick(p, ['name', 'niche', 'target', 'tagline', 'description', 'price_setup', 'price_monthly', 'deliverables']))}
Rédige la page de vente complète, persuasive et HONNÊTE (aucun faux témoignage, aucun chiffre inventé). Ton adapté à la cible.
JSON attendu : {"hero_title":"","hero_subtitle":"","cta":"","problems":["",""],"benefits":[{"title":"","text":""}],"process":[{"step":"","text":""}],"faq":[{"q":"","a":""}],"guarantee":""}`,
  });
  await update('products', productId, { landing: data, status: 'en ligne' });
  log('sam', 'site', `Page de vente en ligne : /offre/${p.slug}`);
  return data;
}

export async function complianceReview(productId) {
  const p = await get('SELECT * FROM products WHERE id = ?', productId);
  const { data } = await askJSON({
    system: systemFor('juliette'), effort: 'medium',
    mock: MOCKS.compliance,
    prompt: `${await companyContext()}\n\nVérifie la conformité de l'offre et de sa page de vente : ${JSON.stringify(pick(p, ['name', 'niche', 'target', 'description', 'landing']))}
JSON attendu : {"verdict":"OK | OK avec corrections | Bloquant","points":["constat"],"corrections":[{"champ":"","nouveau_texte":""}],"questions_fondateur":[""]}`,
  });
  await addQuestions('juliette', data.questions_fondateur, `Conformité : ${p.name}`);
  log('juliette', 'conformité', `Revue de conformité « ${p.name} » : ${data.verdict}`, (data.points || []).join('\n'));
  return data;
}

export async function planCampaigns(productId) {
  const p = await get('SELECT * FROM products WHERE id = ?', productId);
  const s = getSettings();
  const { data } = await askJSON({
    system: systemFor('leo'), effort: 'high', webSearch: true, maxSearches: 4,
    mock: MOCKS.campaign,
    prompt: `${await companyContext()}\n\nOFFRE : ${JSON.stringify(pick(p, ['name', 'niche', 'target', 'tagline', 'price_setup', 'price_monthly']))}
Page de vente : ${baseUrl()}/offre/${p.slug}
Conçois 2 à 3 campagnes (Google Ads, Meta, LinkedIn, SEO local, partenariats...) dans un budget total de ${s.ads_budget_month} €/mois. Pour chacune : ciblage, mots-clés ou audiences, 3 accroches publicitaires, budget, KPI cibles, plan de test.
JSON attendu : {"campaigns":[{"channel":"","name":"","budget":"","plan":{}}],"questions_fondateur":[""]}`,
  });
  for (const c of data.campaigns || []) await insert('campaigns', { product_id: productId, channel: c.channel, name: c.name, budget: c.budget, plan: c.plan });
  await addQuestions('leo', data.questions_fondateur, `Campagnes : ${p.name}`);
  log('leo', 'marketing', `${(data.campaigns || []).length} campagne(s) proposée(s) pour « ${p.name} »`);
}

export async function findProspects(productId, count) {
  const p = await get('SELECT * FROM products WHERE id = ?', productId);
  const n = Number(count || getSettings().prospects_per_cycle || 15);
  const known = (await all('SELECT email FROM prospects WHERE product_id = ? ORDER BY id DESC LIMIT 200', productId)).map((r) => r.email);
  log('hugo', 'prospection', `Recherche de ${n} prospects pour « ${p.name} »…`);
  const { data } = await askJSON({
    system: systemFor('hugo'), webSearch: true, maxSearches: 12, effort: 'high',
    mock: MOCKS.prospects,
    prompt: `${await companyContext()}\n\nOFFRE : ${p.name} — cible : ${p.target} (${p.niche}).
Trouve jusqu'à ${n} prospects RÉELS en France correspondant à la cible, avec une adresse email PROFESSIONNELLE publiée publiquement (site du cabinet/de l'entreprise, annuaire professionnel public). Indique l'URL où l'email est publié. N'invente rien : si tu ne trouves pas l'email, n'inclus pas le prospect.
Déjà connus (à exclure) : ${known.join(', ') || 'aucun'}.
JSON attendu : {"prospects":[{"name":"","company":"","role":"","email":"","phone":"","city":"","website":"","source_url":"","personalization":"détail réel et vérifiable pour personnaliser"}],"questions_fondateur":[""]}`,
  });
  let added = 0;
  const demo = !hasLLM();
  for (const pr of data.prospects || []) {
    if (!pr.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pr.email)) continue;
    if (await get('SELECT id FROM prospects WHERE lower(email) = lower(?)', pr.email)) continue;
    await insert('prospects', { ...pick(pr, ['name', 'company', 'role', 'email', 'phone', 'city', 'website', 'source_url', 'personalization']), product_id: productId, demo: demo ? 1 : 0 });
    added++;
  }
  await addQuestions('hugo', data.questions_fondateur, `Prospection : ${p.name}`);
  log('hugo', 'prospection', `${added} nouveau(x) prospect(s) ajouté(s) pour « ${p.name} »`);
  return added;
}

export async function writeEmails(productId) {
  const p = await get('SELECT * FROM products WHERE id = ?', productId);
  const s = getSettings();
  const prospects = await all(`SELECT * FROM prospects WHERE product_id = ? AND unsubscribed = 0
    AND id NOT IN (SELECT prospect_id FROM emails WHERE prospect_id IS NOT NULL) ORDER BY id LIMIT 25`, productId);
  if (!prospects.length) return 0;
  log('clara', 'email', `Rédaction de séquences pour ${prospects.length} prospect(s)…`);
  const status = s.email_mode === 'auto' ? 'approuvé' : 'brouillon';
  let count = 0;
  for (const pr of prospects) {
    try {
      const { data } = await askJSON({
        system: systemFor('clara'), effort: 'medium', maxTokens: 8000,
        mock: MOCKS.emails,
        prompt: `${await companyContext()}\n\nOFFRE : ${JSON.stringify(pick(p, ['name', 'tagline', 'description', 'price_setup', 'price_monthly', 'deliverables']))}
Page de l'offre : ${baseUrl()}/offre/${p.slug}
PROSPECT : ${JSON.stringify(pick(pr, ['name', 'company', 'role', 'city', 'website', 'personalization']))}
Expéditeur : ${s.founder_name || '[prénom du fondateur]'} — ${s.company_name || s.brand_name}.
Écris une séquence de 3 emails (premier contact personnalisé, relance J+3, dernier message J+7). Chaque email : objet court, 60 à 120 mots, une seule demande claire, vouvoiement, formule adaptée à la profession (« Maître » pour un avocat, « Docteur » pour un médecin). Ne mets PAS de lien de désinscription (ajouté automatiquement).
JSON attendu : {"emails":[{"step":1,"subject":"","body":""},{"step":2,"subject":"","body":""},{"step":3,"subject":"","body":""}]}`,
      });
      for (const e of data.emails || []) {
        const delayDays = e.step === 2 ? 3 : e.step === 3 ? 7 : 0;
        await insert('emails', {
          prospect_id: pr.id, product_id: productId, step: e.step, subject: e.subject, body: e.body, status,
          send_after: delayDays ? new Date(Date.now() + delayDays * 864e5).toISOString().replace('T', ' ').slice(0, 19) : null,
        });
        count++;
      }
    } catch (err) {
      log('clara', 'erreur', `Échec rédaction pour ${pr.email}`, err.message);
    }
  }
  log('clara', 'email', `${count} email(s) rédigé(s) — ${status === 'brouillon' ? 'en attente de ta validation' : 'programmés'}`);
  return count;
}

export async function ceoReport(details = '') {
  const r = await ask({
    system: systemFor('victor'), effort: 'medium', maxTokens: 6000,
    mock: MOCKS.report,
    prompt: `${await companyContext()}\n\nActivité récente :\n${(await all('SELECT agent, title FROM activity ORDER BY id DESC LIMIT 30')).reverse().map((a) => `- ${AGENTS[a.agent]?.name || a.agent} : ${a.title}`).join('\n')}\n${details}
Écris au fondateur un point d'étape clair (tutoiement, 120-250 mots) : ce qu'on a fait, résultats chiffrés, ce qu'on apprend, les 3 prochaines actions, et ce dont l'équipe a besoin de sa part.`,
  });
  await insert('messages', { thread: 'victor', sender: 'victor', text: `📊 Point d'étape\n\n${r.text}` });
  log('victor', 'rapport', 'Point d’étape envoyé au fondateur');
  return r.text;
}

// ------------------------------------------------------------------ cycle complet
let running = null;
export const isRunning = () => Boolean(running);

export async function startCycle(options = {}) {
  if (running) return { already: true, jobId: running };
  const jobId = await insert('jobs', { kind: 'cycle', step: 'démarrage' });
  running = jobId;
  runCycle(jobId, options)
    .then(() => update('jobs', jobId, { status: 'terminé', finished_ts: now() }))
    .catch(async (err) => {
      await update('jobs', jobId, { status: 'erreur', error: String(err.message || err), finished_ts: now() });
      log('victor', 'erreur', 'Le cycle a rencontré une erreur', String(err.message || err));
    })
    .finally(() => { running = null; });
  return { jobId };
}

async function runCycle(jobId, { focus = '' } = {}) {
  const step = (s) => update('jobs', jobId, { step: s });
  log('victor', 'cycle', '🚀 Nouveau cycle de travail lancé');

  // 1. Si aucune offre en ligne, on cherche une niche et on décide d'une offre en réunion
  let product = await get("SELECT * FROM products WHERE status = 'en ligne' ORDER BY id DESC LIMIT 1");
  if (!product || focus) {
    await step('Recherche de niches (Nora)');
    await researchNiches(focus);
    const top = await all('SELECT name, score, problem, offer_idea, willingness_to_pay, competition FROM niches ORDER BY id DESC LIMIT 5');
    await step('Réunion de lancement');
    const { meetingId, data } = await holdMeeting('Choix de la niche et de l’offre à lancer', {
      expectProduct: true,
      extra: `Niches étudiées par Nora :\n${top.map((n) => `- ${n.name} (${n.score}/10) — problème : ${n.problem} — idée : ${n.offer_idea}`).join('\n')}`,
    });
    if (!data.product?.name) throw new Error('La réunion n’a pas produit d’offre.');
    const productId = await createProduct(data.product, meetingId);
    await step('Création de la page de vente (Sam)');
    await buildLanding(productId);
    await step('Revue de conformité (Juliette)');
    await complianceReview(productId);
    await step('Plan marketing (Léo)');
    await planCampaigns(productId);
    product = await get('SELECT * FROM products WHERE id = ?', productId);
  } else {
    // Réunion de pilotage : on regarde les chiffres et on ajuste
    await step('Réunion de pilotage');
    await holdMeeting(`Pilotage de l'offre « ${product.name} » : chiffres, blocages, ajustements`, { participants: ['leo', 'clara', 'hugo', 'ines'] });
  }

  await step('Prospection (Hugo)');
  await findProspects(product.id);
  await step('Rédaction des emails (Clara)');
  await writeEmails(product.id);
  await step('Rapport au fondateur (Victor)');
  await ceoReport();
  log('victor', 'cycle', '✅ Cycle terminé');
}

// ------------------------------------------------------------------ conversations
export async function chatWithAgent(agentId, text) {
  const agent = AGENTS[agentId] || AGENTS.victor;
  await insert('messages', { thread: agent.id, sender: 'fondateur', text });
  const history = (await all('SELECT sender, text FROM messages WHERE thread = ? ORDER BY id DESC LIMIT 16', agent.id)).reverse();
  const recent = (await all('SELECT agent, title, detail FROM activity ORDER BY id DESC LIMIT 25')).reverse()
    .map((a) => `- ${AGENTS[a.agent]?.name || a.agent} : ${a.title}${a.detail ? ` (${String(a.detail).slice(0, 200)})` : ''}`).join('\n');
  const r = await ask({
    system: systemFor(agent.id, 'Tu parles directement avec le fondateur de l’entreprise (ton patron). Tutoie-le, sois clair, honnête et concret. Si tu as besoin d’une décision ou d’une information de sa part, demande-la explicitement.'),
    effort: 'medium', maxTokens: 8000,
    mock: MOCKS.chat(agent.name),
    prompt: `${await companyContext()}\n\nActivité récente de l'équipe :\n${recent}\n\nConversation :\n${history.map((m) => `${m.sender === 'fondateur' ? 'FONDATEUR' : agent.name.toUpperCase()} : ${m.text}`).join('\n')}\n\nRéponds au dernier message du fondateur.`,
  });
  await insert('messages', { thread: agent.id, sender: agent.id, text: r.text });
  return r.text;
}

export async function answerQuestion(questionId, answer) {
  const q = await get('SELECT * FROM questions WHERE id = ?', questionId);
  await update('questions', questionId, { answer, status: 'répondue', answered_ts: now() });
  log(q.agent, 'question', `Le fondateur a répondu : « ${q.question.slice(0, 80)} »`, answer);
  const r = await ask({
    system: systemFor(q.agent), effort: 'low', maxTokens: 2000,
    mock: `[DÉMO] Merci, c'est noté, j'en tiens compte pour la suite.`,
    prompt: `${await companyContext()}\n\nTu avais demandé au fondateur : « ${q.question} ». Il répond : « ${answer} ». Accuse réception en 1 à 3 phrases et dis ce que tu vas faire concrètement avec cette réponse.`,
  });
  await insert('messages', { thread: q.agent, sender: q.agent, text: r.text });
  return r.text;
}

export async function draftReply(prospectId, incoming) {
  const pr = await get('SELECT * FROM prospects WHERE id = ?', prospectId);
  const p = pr.product_id ? await get('SELECT * FROM products WHERE id = ?', pr.product_id) : null;
  const thread = await all("SELECT step, subject, body FROM emails WHERE prospect_id = ? AND status = 'envoyé' ORDER BY step", prospectId);
  await update('prospects', prospectId, { status: 'a répondu', notes: `${pr.notes || ''}\n[${now()}] Réponse reçue : ${incoming}`.trim() });
  await run("UPDATE emails SET status = 'annulé', error = 'Le prospect a répondu' WHERE prospect_id = ? AND status IN ('brouillon','approuvé')", prospectId);
  const { data } = await askJSON({
    system: systemFor('ines'), effort: 'high', maxTokens: 6000,
    mock: { analysis: '[DÉMO] Intérêt modéré, objection prix.', subject: 'Re: votre message', body: '[DÉMO] Bonjour Maître, merci pour votre retour...', next_status: 'a répondu' },
    prompt: `${await companyContext()}\n\nOFFRE : ${p ? JSON.stringify(pick(p, ['name', 'description', 'price_setup', 'price_monthly'])) : 'n/a'}\nLien de paiement : ${baseUrl()}/offre/${p?.slug || ''}
PROSPECT : ${JSON.stringify(pick(pr, ['name', 'company', 'role', 'city', 'personalization']))}
Emails déjà envoyés : ${JSON.stringify(thread)}
RÉPONSE DU PROSPECT : « ${incoming} »
Analyse (intérêt, objection) puis rédige la meilleure réponse pour avancer vers l'achat ou un rendez-vous.
JSON attendu : {"analysis":"","subject":"","body":"","next_status":"a répondu | rdv | pas intéressé"}`,
  });
  const status = getSettings().email_mode === 'auto' && data.next_status !== 'pas intéressé' ? 'approuvé' : 'brouillon';
  if (data.next_status === 'pas intéressé') await update('prospects', prospectId, { status: 'pas intéressé' });
  else if (data.next_status === 'rdv') await update('prospects', prospectId, { status: 'rdv' });
  if (data.next_status !== 'pas intéressé' && data.body) {
    await insert('emails', { prospect_id: prospectId, product_id: pr.product_id, step: 10, subject: data.subject, body: data.body, status });
  }
  log('ines', 'commercial', `Réponse de ${pr.name || pr.email} analysée`, data.analysis);
  return data;
}

// ------------------------------------------------------------------ utilitaires
function pick(o, keys) {
  const r = {};
  for (const k of keys) if (o?.[k] !== undefined && o[k] !== null) r[k] = typeof o[k] === 'string' && (o[k].startsWith('{') || o[k].startsWith('[')) ? parseJSON(o[k], o[k]) : o[k];
  return r;
}
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export async function seedIfEmpty() {
  if ((await get('SELECT COUNT(*) n FROM messages')).n) return;
  await insert('messages', {
    thread: 'victor', sender: 'victor',
    text: `Salut ! Ici Victor, ton directeur général. L'équipe est en place : Nora (recherche de niches), Léo (marketing & pub), Clara (emails), Hugo (prospection), Inès (commerciale), Sam (sites & produit) et Juliette (conformité).

Notre plan : 1) trouver la niche où des professionnels paient déjà pour résoudre un problème douloureux, 2) décider d'une offre claire en réunion, 3) mettre en ligne sa page de vente avec paiement Stripe, 4) prospecter et convaincre par email, 5) mesurer, ajuster, recommencer — sans jamais lâcher.

Mon hypothèse de départ (à valider par Nora) : les avocats indépendants. Douleur forte, budget réel, et on peut livrer un service numérique concret rapidement.

Pour passer en réel, j'ai besoin de toi dans l'onglet « Questions » : informations légales de l'entreprise, ton domaine d'envoi d'emails, et ton budget publicitaire. Ensuite, clique sur « Lancer un cycle ».`,
  });
  const qs = [
    ['victor', "Quel est le nom légal de ton entreprise, sa forme (auto-entreprise, SASU...), son SIRET et son adresse ? C'est obligatoire dans les emails, les mentions légales et les CGV. (Tu peux aussi les saisir dans Paramètres.)"],
    ['clara', "Depuis quel nom de domaine veux-tu envoyer les emails de prospection ? Conseil : un domaine dédié (ex. votremarque-pro.fr) avec SPF/DKIM/DMARC configurés, pour protéger ta boîte principale."],
    ['leo', 'Quel budget publicitaire mensuel m’autorises-tu pour tester Google Ads / LinkedIn (je propose de commencer à 300 €/mois) ?'],
    ['victor', "Veux-tu valider chaque email avant envoi (recommandé au début) ou laisser l'équipe envoyer automatiquement ?"],
  ];
  for (const [agent, question] of qs) await insert('questions', { agent, question, context: 'Démarrage' });
  log('victor', 'cycle', 'Équipe constituée. En attente du feu vert du fondateur.');
}
