// Serveur principal : site public + paiement + back-office du fondateur.
import './env.js';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { all, get, insert, update, run, getSettings, setSetting, log, parseJSON, secret, SECRET_KEYS, baseUrl, initDb, dbKind } from './db.js';
import { AGENT_LIST, AGENTS } from './agents.js';
import { hasLLM } from './llm.js';
import { hasStripe, createCheckout, handleWebhook } from './payments.js';
import { hasSMTP, processQueue, sentToday } from './mailer.js';
import * as orch from './orchestrator.js';
import { renderHome, renderProduct, renderLegal, simplePage } from './site.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Le webhook Stripe a besoin du corps brut : il est déclaré AVANT express.json()
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const r = await handleWebhook(req.body, req.headers['stripe-signature']);
    if (r?.orderId) {
      await insert('messages', { thread: 'victor', sender: 'victor', text: `💶 Nouvelle vente encaissée (commande #${r.orderId}) ! Sam prépare la livraison. Pense à contacter le client pour l’appel de lancement.` });
      await insert('questions', { agent: 'sam', question: `Nouvelle commande #${r.orderId} : peux-tu planifier l'appel de lancement avec le client (ou me dire qui s'en charge) ?`, context: 'Livraison' });
    }
    res.json({ received: true });
  } catch (err) {
    res.status(400).send(`Webhook error: ${err.message}`);
  }
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(['/admin', '/api/admin'], adminAuth); // tout le back-office est protégé par mot de passe
app.use(express.static(path.resolve('public'), { index: false }));

// ------------------------------------------------------------------ site public
app.get('/', async (req, res) => res.send(renderHome(await all("SELECT * FROM products WHERE status = 'en ligne' ORDER BY id DESC"))));
app.get('/offre/:slug', async (req, res) => {
  const p = await get('SELECT * FROM products WHERE slug = ?', req.params.slug);
  if (!p || p.status === 'archivé') return res.status(404).send(simplePage('Offre introuvable', 'Cette offre n’existe pas ou plus.'));
  res.send(renderProduct(p));
});
app.post('/api/checkout/:slug', async (req, res) => {
  const p = await get('SELECT * FROM products WHERE slug = ?', req.params.slug);
  if (!p) return res.status(404).send(simplePage('Offre introuvable', ''));
  if (!hasStripe()) return res.send(simplePage('Paiement bientôt disponible', 'Le paiement en ligne n’est pas encore activé. Laissez-nous vos coordonnées via le formulaire de contact, nous revenons vers vous sous 24 h.'));
  try { res.redirect(303, await createCheckout(p)); } catch (err) {
    log('sam', 'erreur', 'Erreur Stripe', err.message);
    res.status(500).send(simplePage('Erreur de paiement', 'Une erreur est survenue, merci de réessayer.'));
  }
});
// Page de santé : sert aussi à garder le site éveillé sur un hébergement gratuit (ping toutes les 10 min)
app.get('/sante', async (req, res) => res.json({ ok: true, db: dbKind }));
app.get('/merci', async (req, res) => res.send(simplePage('Merci pour votre confiance !', 'Votre paiement est confirmé. Nous vous contactons sous 24 h ouvrées pour lancer votre projet.')));
app.post('/api/lead', async (req, res) => {
  const { name, email, phone, message, product_id } = req.body;
  if (!email) return res.status(400).send(simplePage('Email manquant', 'Merci d’indiquer votre email.'));
  await insert('leads', { name, email, phone, message, product_id: product_id ? Number(product_id) : null });
  log('ines', 'lead', `📥 Nouveau contact via le site : ${name || email}`, message || '');
  res.send(simplePage('Message bien reçu', 'Merci ! Nous revenons vers vous très rapidement.'));
});
app.get('/desabonnement', async (req, res) => {
  const p = req.query.t ? await get('SELECT * FROM prospects WHERE token = ?', String(req.query.t)) : null;
  if (p) {
    await update('prospects', p.id, { unsubscribed: 1, status: 'désinscrit' });
    await run("UPDATE emails SET status = 'annulé', error = 'Désinscription' WHERE prospect_id = ? AND status IN ('brouillon','approuvé')", p.id);
    log('hugo', 'prospection', `Désinscription : ${p.email}`);
  }
  res.send(simplePage('Désinscription confirmée', 'Vous ne recevrez plus de messages de notre part.'));
});
for (const k of ['mentions-legales', 'cgv', 'confidentialite']) app.get(`/${k}`, async (req, res) => res.send(renderLegal(k)));

// ------------------------------------------------------------------ back-office (protégé)
function adminAuth(req, res, next) {
  const pwd = process.env.ADMIN_PASSWORD;
  if (!pwd) return res.status(503).send('Définissez ADMIN_PASSWORD pour accéder au back-office.');
  const [scheme, value] = (req.headers.authorization || '').split(' ');
  const given = scheme === 'Basic' && value ? Buffer.from(value, 'base64').toString().split(':').slice(1).join(':') : '';
  const ok = given.length === pwd.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(pwd));
  if (ok) return next();
  res.set('WWW-Authenticate', 'Basic realm="QG fondateur"').status(401).send('Accès réservé au fondateur.');
}
app.get('/admin', async (req, res) => res.sendFile(path.resolve('public/admin/index.html')));

const A = express.Router();
app.use('/api/admin', A);
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((err) => res.status(500).json({ error: String(err.message || err) }));

A.get('/overview', async (req, res) => {
  const s = getSettings();
  res.json({
    agents: AGENT_LIST,
    integrations: { claude: hasLLM(), stripe: hasStripe(), stripeWebhook: Boolean(secret('STRIPE_WEBHOOK_SECRET')), smtp: hasSMTP() },
    running: orch.isRunning(),
    job: await get('SELECT * FROM jobs ORDER BY id DESC LIMIT 1'),
    kpi: {
      revenue: (await get("SELECT COALESCE(SUM(amount),0) v FROM orders WHERE status = 'payé'")).v,
      orders: (await get("SELECT COUNT(*) n FROM orders WHERE status = 'payé'")).n,
      prospects: (await get('SELECT COUNT(*) n FROM prospects')).n,
      contacted: (await get("SELECT COUNT(*) n FROM prospects WHERE status NOT IN ('nouveau')")).n,
      replied: (await get("SELECT COUNT(*) n FROM prospects WHERE status IN ('a répondu','rdv','client')")).n,
      emailsSent: (await get("SELECT COUNT(*) n FROM emails WHERE status = 'envoyé'")).n,
      sentToday: await sentToday(),
      toValidate: (await get("SELECT COUNT(*) n FROM emails WHERE status = 'brouillon'")).n,
      questions: (await get("SELECT COUNT(*) n FROM questions WHERE status = 'en attente'")).n,
      leads: (await get("SELECT COUNT(*) n FROM leads WHERE status = 'nouveau'")).n,
      products: (await get("SELECT COUNT(*) n FROM products WHERE status = 'en ligne'")).n,
    },
    settings: Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith('secret_'))),
    // Les clés ne sont jamais renvoyées au navigateur : on indique seulement si elles sont renseignées
    secrets: Object.fromEntries(SECRET_KEYS.map((k) => [k, Boolean(secret(k))])),
    smtpPort: secret('SMTP_PORT') || '587',
    webhookUrl: `${baseUrl()}/api/stripe/webhook`,
    db: dbKind,
  });
});

A.get('/activity', async (req, res) => res.json(await all('SELECT * FROM activity ORDER BY id DESC LIMIT ?', Number(req.query.limit || 200))));
A.get('/niches', async (req, res) => res.json((await all('SELECT * FROM niches ORDER BY id DESC LIMIT 100')).map((n) => ({ ...n, sources: parseJSON(n.sources, []) }))));
A.get('/products', async (req, res) => res.json((await all('SELECT * FROM products ORDER BY id DESC')).map((p) => ({ ...p, deliverables: parseJSON(p.deliverables, []), landing: parseJSON(p.landing, null) }))));
A.post('/products/:id', async (req, res) => { await update('products', Number(req.params.id), pickBody(req.body, ['status', 'name', 'tagline', 'price_setup', 'price_monthly'])); res.json({ ok: true }); });
A.get('/meetings', async (req, res) => res.json(await all('SELECT id, ts, topic, status, summary, founder_comment FROM meetings ORDER BY id DESC')));
A.get('/meetings/:id', async (req, res) => {
  const m = await get('SELECT * FROM meetings WHERE id = ?', Number(req.params.id));
  res.json(m ? { ...m, transcript: parseJSON(m.transcript, []), decisions: parseJSON(m.decisions, []) } : null);
});
A.post('/meetings', wrap(async (req, res) => {
  const topic = String(req.body.topic || '').trim();
  if (!topic) return res.status(400).json({ error: 'Sujet manquant' });
  const participants = Array.isArray(req.body.participants) && req.body.participants.length ? req.body.participants.filter((p) => AGENTS[p] && p !== 'victor') : undefined;
  orch.holdMeeting(topic, { participants }).catch((err) => log('victor', 'erreur', 'Réunion interrompue', err.message));
  res.json({ ok: true });
}));
A.post('/meetings/:id/comment', async (req, res) => {
  await update('meetings', Number(req.params.id), { founder_comment: String(req.body.comment || '') });
  log('victor', 'réunion', 'Le fondateur a donné son avis sur une réunion', req.body.comment);
  res.json({ ok: true });
});
A.get('/messages', async (req, res) => res.json(await all('SELECT * FROM messages WHERE thread = ? ORDER BY id ASC', String(req.query.thread || 'victor'))));
A.post('/chat', wrap(async (req, res) => res.json({ reply: await orch.chatWithAgent(String(req.body.agent || 'victor'), String(req.body.text || '')) })));
A.get('/questions', async (req, res) => res.json(await all("SELECT * FROM questions ORDER BY status = 'en attente' DESC, id DESC")));
A.post('/questions/:id/answer', wrap(async (req, res) => res.json({ reply: await orch.answerQuestion(Number(req.params.id), String(req.body.answer || '')) })));
A.get('/prospects', async (req, res) => res.json(await all('SELECT p.*, (SELECT COUNT(*) FROM emails e WHERE e.prospect_id = p.id AND e.status = \'envoyé\') AS sent FROM prospects p ORDER BY id DESC LIMIT 1000')));
A.post('/prospects/:id', async (req, res) => { await update('prospects', Number(req.params.id), pickBody(req.body, ['status', 'notes'])); res.json({ ok: true }); });
A.post('/prospects/:id/reply', wrap(async (req, res) => res.json(await orch.draftReply(Number(req.params.id), String(req.body.text || '')))));
A.post('/prospects-import', async (req, res) => {
  // CSV : nom;entreprise;email;ville;site;source
  const productId = Number(req.body.product_id) || null;
  let added = 0;
  for (const line of String(req.body.csv || '').split(/\r?\n/)) {
    const [name, company, email, city, website, source_url] = line.split(/[;,\t]/).map((x) => x?.trim());
    if (!email || !email.includes('@') || await get('SELECT id FROM prospects WHERE lower(email) = lower(?)', email)) continue;
    await insert('prospects', { name, company, email, city, website, source_url: source_url || 'import manuel', product_id: productId });
    added++;
  }
  log('hugo', 'prospection', `${added} prospect(s) importé(s) par le fondateur`);
  res.json({ added });
});
A.get('/emails', async (req, res) => res.json(await all(`SELECT e.*, p.name AS p_name, p.company AS p_company, p.email AS p_email, p.demo
  FROM emails e LEFT JOIN prospects p ON p.id = e.prospect_id ORDER BY e.status = 'brouillon' DESC, e.id DESC LIMIT 500`)));
A.post('/emails/:id', async (req, res) => {
  const { action, subject, body } = req.body;
  const id = Number(req.params.id);
  if (subject !== undefined || body !== undefined) await update('emails', id, pickBody(req.body, ['subject', 'body']));
  if (action === 'approve') await update('emails', id, { status: 'approuvé' });
  if (action === 'reject') await update('emails', id, { status: 'rejeté' });
  res.json({ ok: true });
});
A.post('/emails-approve-all', async (req, res) => {
  const r = await run("UPDATE emails SET status = 'approuvé' WHERE status = 'brouillon'");
  log('clara', 'email', `Le fondateur a validé ${r.changes} email(s)`);
  res.json({ approved: r.changes });
});
A.post('/send-now', wrap(async (req, res) => res.json(await processQueue())));
A.get('/campaigns', async (req, res) => res.json((await all('SELECT c.*, p.name AS product FROM campaigns c LEFT JOIN products p ON p.id = c.product_id ORDER BY c.id DESC')).map((c) => ({ ...c, plan: parseJSON(c.plan, c.plan) }))));
A.post('/campaigns/:id', async (req, res) => { await update('campaigns', Number(req.params.id), pickBody(req.body, ['status'])); res.json({ ok: true }); });
A.get('/orders', async (req, res) => res.json(await all('SELECT o.*, p.name AS product FROM orders o LEFT JOIN products p ON p.id = o.product_id ORDER BY o.id DESC')));
A.get('/leads', async (req, res) => res.json(await all('SELECT l.*, p.name AS product FROM leads l LEFT JOIN products p ON p.id = l.product_id ORDER BY l.id DESC')));
A.post('/leads/:id', async (req, res) => { await update('leads', Number(req.params.id), pickBody(req.body, ['status'])); res.json({ ok: true }); });
A.post('/cycle', async (req, res) => res.json(await orch.startCycle({ focus: String(req.body.focus || '') })));
A.post('/research', wrap(async (req, res) => {
  orch.researchNiches(String(req.body.focus || '')).catch((err) => log('nora', 'erreur', 'Recherche interrompue', err.message));
  res.json({ ok: true });
}));
A.post('/settings', async (req, res) => {
  const allowed = ['public_url', 'brand_name', 'autopilot', 'email_mode', 'sending_enabled', 'daily_email_limit', 'prospects_per_cycle', 'company_name', 'company_legal', 'company_address', 'contact_email', 'founder_name', 'founder_vision', 'ads_budget_month'];
  for (const [k, v] of Object.entries(req.body)) {
    if (allowed.includes(k)) await setSetting(k, v);
    // une clé laissée vide n'efface pas la clé déjà enregistrée
    if (SECRET_KEYS.includes(k) && String(v).trim()) await setSetting(`secret_${k}`, String(v).trim());
  }
  log('victor', 'paramètres', 'Le fondateur a mis à jour les paramètres');
  res.json({ ok: true });
});

function pickBody(b, keys) {
  return Object.fromEntries(keys.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));
}

// ------------------------------------------------------------------ autopilote
await initDb();
await orch.seedIfEmpty();
setInterval(() => processQueue().catch((e) => log('clara', 'erreur', 'File d’envoi', e.message)), 10 * 60 * 1000);
let lastCycle = 0;
setInterval(() => {
  const s = getSettings();
  const every = Number(process.env.CYCLE_HOURS || 24) * 3600 * 1000;
  if (s.autopilot === 'true' && hasLLM() && Date.now() - lastCycle > every && !orch.isRunning()) {
    lastCycle = Date.now();
    orch.startCycle();
  }
}, 5 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`\n  ${getSettings().brand_name} — QG des agents`);
  console.log(`  Site public  : http://localhost:${PORT}/`);
  console.log(`  Back-office  : http://localhost:${PORT}/admin`);
  console.log(`  Base de données : ${dbKind}`);
  console.log(`  Claude ${hasLLM() ? '✅' : '❌ (mode démo)'} · Stripe ${hasStripe() ? '✅' : '❌'} · SMTP ${hasSMTP() ? '✅' : '❌'}\n`);
});
