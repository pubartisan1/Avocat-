// QG du fondateur — interface du back-office
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (url, body) => {
  const r = await fetch(`/api/admin${url}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};
const toast = (t) => { const el = $('#toast'); el.textContent = t; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 2600); };
const fmtDate = (s) => (s ? new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z')).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const euros = (n) => `${Number(n || 0).toLocaleString('fr-FR')} €`;

let O = null; // overview
let tab = location.hash.slice(1) || 'dashboard';
let chatAgent = 'victor';
const agent = (id) => O?.agents.find((a) => a.id === id) || { name: id, emoji: '•', color: '#888', role: '' };
const avatar = (id) => { const a = agent(id); return `<div class="av" style="background:${a.color}22" title="${esc(a.name)}">${a.emoji}</div>`; };

async function refreshOverview() {
  O = await api('/overview');
  $('#brand').textContent = `QG ${O.settings.brand_name}`;
  $('#badge-q').textContent = O.kpi.questions || '';
  $('#badge-e').textContent = O.kpi.toValidate || '';
  $('#team').innerHTML = `<div class="ts" style="padding:0 10px 6px">L'équipe</div>` + O.agents.map((a) => `<div class="member"><span class="dot" style="background:${a.color}"></span><span>${a.emoji} <b>${esc(a.name)}</b><br><small>${esc(a.role)}</small></span></div>`).join('');
}

function go(t) { tab = t; location.hash = t; render(); }
document.querySelectorAll('nav a').forEach((a) => a.addEventListener('click', () => go(a.dataset.tab)));

async function render() {
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  try { await refreshOverview(); await (VIEWS[tab] || VIEWS.dashboard)(); } catch (e) { $('#view').innerHTML = `<div class="banner">Erreur : ${esc(e.message)}</div>`; }
}

function banners() {
  const i = O.integrations;
  const b = [];
  const btn = '<button onclick="go(\'settings\')" style="margin-left:8px">Le faire maintenant</button>';
  if (!i.claude) b.push(`<b>Étape 1 :</b> colle ta clé Anthropic pour que les agents travaillent pour de vrai (pour l’instant : mode démo). ${btn}`);
  if (!i.stripe) b.push(`<b>Étape 2 :</b> connecte Stripe pour encaisser les ventes. ${btn}`);
  if (!i.smtp) b.push(`<b>Étape 3 :</b> connecte ta messagerie pour envoyer les emails. ${btn}`);
  return b.map((x) => `<div class="banner">${x}</div>`).join('');
}

const VIEWS = {
  async dashboard() {
    const [acts, msgs] = await Promise.all([api('/activity?limit=25'), api('/messages?thread=victor')]);
    const mine = [...msgs].reverse().filter((m) => m.sender === 'victor');
    const last = mine.find((m) => m.text.startsWith('📊')) || mine[0];
    const k = O.kpi;
    const job = O.job;
    $('#view').innerHTML = `
      <h1>Bonjour 👋</h1><p class="sub">Voici où en est ton entreprise. Les agents travaillent pour toi — tu gardes la main sur chaque décision importante.</p>
      ${banners()}
      <div class="kpis">
        <div class="kpi"><div class="v">${euros(k.revenue)}</div><div class="l">Chiffre d'affaires</div></div>
        <div class="kpi"><div class="v">${k.orders}</div><div class="l">Ventes</div></div>
        <div class="kpi"><div class="v">${k.products}</div><div class="l">Offres en ligne</div></div>
        <div class="kpi"><div class="v">${k.prospects}</div><div class="l">Prospects</div></div>
        <div class="kpi"><div class="v">${k.emailsSent}</div><div class="l">Emails envoyés (${k.sentToday} auj.)</div></div>
        <div class="kpi"><div class="v">${k.replied}</div><div class="l">Réponses / RDV</div></div>
        <div class="kpi"><div class="v">${k.leads}</div><div class="l">Contacts via le site</div></div>
      </div>
      <div class="panel" style="margin-top:14px">
        <div class="row"><b>Mission</b> ${O.running ? `<span class="pill warn"><span class="spin">⟳</span> En cours : ${esc(job?.step)}</span>` : job ? `<span class="pill ${job.status === 'erreur' ? 'bad' : 'ok'}">Dernier cycle : ${esc(job.status)} ${fmtDate(job.finished_ts || job.ts)}</span>` : ''}</div>
        ${job?.error ? `<p class="ts">Erreur : ${esc(job.error)}</p>` : ''}
        <div class="row" style="margin-top:10px">
          <input id="focus" placeholder="Orientation facultative (ex : « artisans plombiers en Île-de-France », « nouvelle niche santé »)" style="flex:1;min-width:240px">
          <button id="go" ${O.running ? 'disabled' : ''}>🚀 Lancer un cycle complet</button>
        </div>
        <p class="ts">Un cycle = recherche de niche (si besoin) → réunion de décision → page de vente → conformité → campagnes → prospection → emails → rapport. Avec une orientation, l'équipe étudie une nouvelle niche et peut lancer une nouvelle offre.</p>
      </div>
      <div class="grid2">
        <div class="panel"><div class="row" style="justify-content:space-between"><b>🧭 Dernier point de Victor</b><button class="ghost" onclick="go('chat')">Répondre</button></div>
          <p style="white-space:pre-wrap">${esc(last?.text || '—')}</p><span class="ts">${fmtDate(last?.ts)}</span></div>
        <div class="panel"><b>En direct de l'équipe</b><div class="feed">${feed(acts)}</div></div>
      </div>`;
    $('#go').onclick = async () => {
      const r = await api('/cycle', { focus: $('#focus').value });
      toast(r.already ? 'Un cycle est déjà en cours' : 'Cycle lancé — suis l’avancement ici');
      render();
    };
  },

  async chat() {
    const msgs = await api(`/messages?thread=${chatAgent}`);
    const a = agent(chatAgent);
    $('#view').innerHTML = `<h1>Parler aux agents</h1><p class="sub">Pose tes questions, donne tes consignes : chaque agent connaît l'état de l'entreprise et tient compte de tes messages dans son travail.</p>
      <div class="chat">
        <div class="agents panel">${O.agents.map((x) => `<a data-a="${x.id}" class="${x.id === chatAgent ? 'on' : ''}">${avatar(x.id)}<span><b>${esc(x.name)}</b><small>${esc(x.role)}</small></span></a>`).join('')}</div>
        <div class="thread">
          <div class="row" style="padding:10px 14px;border-bottom:1px solid var(--line)">${avatar(a.id)}<b>${esc(a.name)}</b><span class="ts">${esc(a.role)}</span></div>
          <div class="msgs" id="msgs">${msgs.map((m) => `<div class="msg ${m.sender === 'fondateur' ? 'me' : 'them'}">${esc(m.text)}<div class="ts" style="color:inherit;opacity:.7">${fmtDate(m.ts)}</div></div>`).join('') || `<p class="ts">Commence la conversation avec ${esc(a.name)}.</p>`}</div>
          <div class="composer"><textarea id="txt" rows="2" placeholder="Écris à ${esc(a.name)}… (Entrée pour envoyer)"></textarea><button id="send">Envoyer</button></div>
        </div>
      </div>`;
    document.querySelectorAll('.agents a').forEach((el) => el.onclick = () => { chatAgent = el.dataset.a; render(); });
    const box = $('#msgs'); box.scrollTop = box.scrollHeight;
    const send = async () => {
      const text = $('#txt').value.trim(); if (!text) return;
      $('#send').disabled = true;
      box.insertAdjacentHTML('beforeend', `<div class="msg me">${esc(text)}</div><div class="msg them" id="typing"><span class="spin">⟳</span> ${esc(a.name)} réfléchit…</div>`);
      box.scrollTop = box.scrollHeight; $('#txt').value = '';
      try { await api('/chat', { agent: chatAgent, text }); } catch (e) { toast(e.message); }
      render();
    };
    $('#send').onclick = send;
    $('#txt').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  },

  async questions() {
    const qs = await api('/questions');
    $('#view').innerHTML = `<h1>Questions des agents</h1><p class="sub">Quand une décision dépend de toi, les agents te demandent ici. Tes réponses sont prioritaires dans tout leur travail.</p>
      ${qs.map((q) => `<div class="panel"><div class="row">${avatar(q.agent)}<b>${esc(agent(q.agent).name)}</b><span class="ts">${fmtDate(q.ts)} · ${esc(q.context || '')}</span>
        <span class="pill ${q.status === 'en attente' ? 'warn' : 'ok'}">${esc(q.status)}</span></div>
        <p style="white-space:pre-wrap">${esc(q.question)}</p>
        ${q.status === 'en attente' ? `<textarea rows="2" id="a${q.id}" placeholder="Ta réponse…"></textarea><div class="row" style="margin-top:8px"><button data-q="${q.id}">Répondre</button></div>`
        : `<p><b>Ta réponse :</b> ${esc(q.answer)}</p>`}</div>`).join('') || '<p>Aucune question pour le moment.</p>'}`;
    document.querySelectorAll('[data-q]').forEach((b) => b.onclick = async () => {
      const answer = $(`#a${b.dataset.q}`).value.trim(); if (!answer) return;
      b.disabled = true; b.textContent = 'Envoi…';
      try { await api(`/questions/${b.dataset.q}/answer`, { answer }); toast('Réponse transmise'); } catch (e) { toast(e.message); }
      render();
    });
  },

  async meetings() {
    const list = await api('/meetings');
    $('#view').innerHTML = `<h1>Réunions</h1><p class="sub">Assiste à toutes les réunions de l'équipe, donne ton avis, ou convoque-en une sur le sujet de ton choix.</p>
      <div class="panel"><b>Convoquer une réunion</b>
        <div class="row" style="margin-top:8px"><input id="topic" placeholder="Sujet (ex : « Pourquoi le taux de réponse est faible et comment le doubler ? »)" style="flex:1;min-width:260px"><button id="conv">Convoquer</button></div>
        <div class="row" style="margin-top:8px">${O.agents.filter((a) => a.id !== 'victor').map((a) => `<label style="margin:0"><input type="checkbox" value="${a.id}" checked style="width:auto"> ${a.emoji} ${esc(a.name)}</label>`).join('')}</div></div>
      <div id="mlist">${list.map((m) => `<div class="panel" style="cursor:pointer" data-m="${m.id}"><div class="row"><b>${esc(m.topic)}</b><span class="pill ${m.status === 'terminée' ? 'ok' : 'warn'}">${esc(m.status)}</span>${m.founder_comment ? '<span class="pill">💬 ton avis</span>' : ''}<span class="ts">${fmtDate(m.ts)}</span></div><p class="ts">${esc(m.summary || '')}</p></div>`).join('') || '<p>Aucune réunion pour le moment.</p>'}</div>`;
    $('#conv').onclick = async () => {
      const topic = $('#topic').value.trim(); if (!topic) return;
      const participants = [...document.querySelectorAll('.panel input[type=checkbox]:checked')].map((c) => c.value);
      await api('/meetings', { topic, participants }); toast('Réunion convoquée — elle apparaît dans la liste'); setTimeout(render, 1200);
    };
    document.querySelectorAll('[data-m]').forEach((el) => el.onclick = () => meeting(el.dataset.m));
  },

  async emails() {
    const list = await api('/emails');
    const drafts = list.filter((e) => e.status === 'brouillon');
    const others = list.filter((e) => e.status !== 'brouillon');
    $('#view').innerHTML = `<h1>Emails</h1><p class="sub">Valide, modifie ou rejette les emails rédigés par Clara et Inès. Seuls les emails approuvés partent, dans la limite quotidienne, si l'envoi est activé dans les paramètres.</p>
      <div class="row" style="margin-bottom:14px"><button class="ok" id="all" ${drafts.length ? '' : 'disabled'}>✅ Tout approuver (${drafts.length})</button><button class="ghost" id="now">📤 Envoyer maintenant les emails approuvés</button>
      <span class="pill ${O.settings.sending_enabled === 'true' ? 'ok' : 'bad'}">Envoi ${O.settings.sending_enabled === 'true' ? 'activé' : 'désactivé'}</span></div>
      ${drafts.map((e) => `<div class="email"><div class="row"><b>${esc(e.p_name || '')}</b><span class="ts">${esc(e.p_company || '')} · ${esc(e.p_email)} · étape ${e.step}</span>${e.demo ? '<span class="pill warn">démo</span>' : ''}</div>
        <label>Objet</label><input id="s${e.id}" value="${esc(e.subject)}"><label>Message</label><textarea id="b${e.id}" rows="8">${esc(e.body)}</textarea>
        <div class="row" style="margin-top:8px"><button class="ok" data-e="${e.id}" data-act="approve">Approuver</button><button class="ghost" data-e="${e.id}" data-act="save">Enregistrer</button><button class="bad" data-e="${e.id}" data-act="reject">Rejeter</button></div></div>`).join('') || '<p>Aucun email en attente de validation.</p>'}
      <h2>Historique</h2><table><tr><th>Prospect</th><th>Objet</th><th>Étape</th><th>Statut</th><th>Date</th></tr>
      ${others.map((e) => `<tr><td>${esc(e.p_name || e.p_email)}</td><td>${esc(e.subject)}</td><td>${e.step}</td><td><span class="pill ${e.status === 'envoyé' ? 'ok' : e.status === 'échec' ? 'bad' : ''}">${esc(e.status)}</span> ${e.error ? `<span class="ts">${esc(e.error)}</span>` : ''}</td><td class="ts">${fmtDate(e.sent_ts || e.send_after || e.ts)}</td></tr>`).join('')}</table>`;
    $('#all').onclick = async () => { const r = await api('/emails-approve-all', {}); toast(`${r.approved} email(s) approuvé(s)`); render(); };
    $('#now').onclick = async () => { const r = await api('/send-now', {}); toast(r.reason || `${r.sent} email(s) envoyé(s)`); render(); };
    document.querySelectorAll('[data-e]').forEach((b) => b.onclick = async () => {
      const id = b.dataset.e;
      await api(`/emails/${id}`, { subject: $(`#s${id}`).value, body: $(`#b${id}`).value, action: b.dataset.act });
      toast(b.dataset.act === 'approve' ? 'Approuvé' : b.dataset.act === 'reject' ? 'Rejeté' : 'Enregistré'); render();
    });
  },

  async prospects() {
    const [list, products] = await Promise.all([api('/prospects'), api('/products')]);
    const statuses = ['nouveau', 'contacté', 'a répondu', 'rdv', 'client', 'pas intéressé', 'désinscrit'];
    $('#view').innerHTML = `<h1>Prospects</h1><p class="sub">Trouvés par Hugo (avec la source publique de chaque contact) ou importés par toi. Quand un prospect répond, colle sa réponse : Inès prépare la meilleure réponse.</p>
      <div class="panel"><details><summary><b>Importer des prospects (CSV)</b></summary>
        <p class="ts">Une ligne par contact : nom;entreprise;email;ville;site;source</p>
        <select id="ip">${products.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
        <textarea id="csv" rows="4" style="margin-top:8px"></textarea><button id="imp" style="margin-top:8px">Importer</button></details></div>
      <table><tr><th>Contact</th><th>Ville</th><th>Personnalisation</th><th>Statut</th><th></th></tr>
      ${list.map((p) => `<tr><td><b>${esc(p.name)}</b><br>${esc(p.company || '')}<br><span class="ts">${esc(p.email)}</span>${p.demo ? ' <span class="pill warn">démo</span>' : ''}${p.source_url ? `<br><a class="ts" href="${esc(p.source_url)}" target="_blank" rel="noopener">source</a>` : ''}</td>
        <td>${esc(p.city || '')}</td><td class="ts">${esc(p.personalization || '')}</td>
        <td><select data-p="${p.id}">${statuses.map((s) => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select><span class="ts">${p.sent} envoyé(s)</span></td>
        <td><button class="ghost" data-r="${p.id}">Il a répondu</button></td></tr>`).join('')}</table>`;
    $('#imp').onclick = async () => { const r = await api('/prospects-import', { csv: $('#csv').value, product_id: $('#ip').value }); toast(`${r.added} prospect(s) importé(s)`); render(); };
    document.querySelectorAll('[data-p]').forEach((s) => s.onchange = async () => { await api(`/prospects/${s.dataset.p}`, { status: s.value }); toast('Statut mis à jour'); });
    document.querySelectorAll('[data-r]').forEach((b) => b.onclick = async () => {
      const text = prompt('Colle ici la réponse du prospect :'); if (!text) return;
      b.disabled = true; b.textContent = 'Inès analyse…';
      try { const r = await api(`/prospects/${b.dataset.r}/reply`, { text }); alert(`Analyse d'Inès :\n${r.analysis}\n\nSa proposition de réponse est dans « Emails à valider ».`); } catch (e) { toast(e.message); }
      render();
    });
  },

  async products() {
    const list = await api('/products');
    $('#view').innerHTML = `<h1>Offres & sites</h1><p class="sub">Chaque offre décidée en réunion a sa page de vente avec paiement Stripe.</p>
      ${list.map((p) => `<div class="panel"><div class="row"><b style="font-size:17px">${esc(p.name)}</b><span class="pill ${p.status === 'en ligne' ? 'ok' : ''}">${esc(p.status)}</span><span class="ts">${esc(p.niche)}</span></div>
        <p>${esc(p.tagline)}</p><p class="ts">${esc(p.description)}</p>
        <p><b>${euros(p.price_setup)}</b> de mise en place + <b>${euros(p.price_monthly)}</b>/mois · Cible : ${esc(p.target)}</p>
        <div class="row"><a class="btn" href="/offre/${esc(p.slug)}" target="_blank">Voir la page de vente ↗</a>
        ${p.status === 'en ligne' ? `<button class="ghost" data-s="${p.id}" data-v="pause">Mettre en pause</button>` : `<button class="ok" data-s="${p.id}" data-v="en ligne">Mettre en ligne</button>`}
        <button class="ghost" data-s="${p.id}" data-v="archivé">Archiver</button></div></div>`).join('') || '<p>Aucune offre : lance un cycle depuis le tableau de bord.</p>'}`;
    document.querySelectorAll('[data-s]').forEach((b) => b.onclick = async () => { await api(`/products/${b.dataset.s}`, { status: b.dataset.v }); render(); });
  },

  async campaigns() {
    const list = await api('/campaigns');
    $('#view').innerHTML = `<h1>Campagnes marketing</h1><p class="sub">Plans proposés par Léo. Rien n'est dépensé sans toi : valide un plan, puis lance-le dans ton compte publicitaire (Google Ads, Meta, LinkedIn).</p>
      ${list.map((c) => `<div class="panel"><div class="row"><b>${esc(c.channel)} — ${esc(c.name)}</b><span class="pill">${esc(c.budget)}</span><span class="pill ${c.status === 'validée' ? 'ok' : ''}">${esc(c.status)}</span><span class="ts">${esc(c.product || '')}</span></div>
        <pre style="margin-top:8px">${esc(typeof c.plan === 'string' ? c.plan : JSON.stringify(c.plan, null, 2))}</pre>
        <div class="row" style="margin-top:8px"><button class="ok" data-c="${c.id}" data-v="validée">Valider</button><button class="ghost" data-c="${c.id}" data-v="refusée">Refuser</button></div></div>`).join('') || '<p>Aucune campagne pour le moment.</p>'}`;
    document.querySelectorAll('[data-c]').forEach((b) => b.onclick = async () => { await api(`/campaigns/${b.dataset.c}`, { status: b.dataset.v }); render(); });
  },

  async niches() {
    const list = await api('/niches');
    $('#view').innerHTML = `<h1>Niches étudiées</h1><p class="sub">Analyses de Nora, avec ses sources.</p>
      <div class="panel row"><input id="nf" placeholder="Étudier une niche précise (ex : « kinésithérapeutes », « couvreurs »)" style="flex:1;min-width:240px"><button id="nr">🔎 Lancer une recherche</button></div>
      ${list.map((n) => `<div class="panel"><div class="row"><b>${esc(n.name)}</b><span class="pill ${n.score >= 8 ? 'ok' : n.score >= 6.5 ? 'warn' : 'bad'}">${n.score}/10</span><span class="ts">${esc(n.sector)} · ${fmtDate(n.ts)}</span></div>
        <p><b>Problème :</b> ${esc(n.problem)}</p><p><b>Offre possible :</b> ${esc(n.offer_idea)}</p>
        <p class="ts"><b>Cible :</b> ${esc(n.audience)} · <b>Capacité à payer :</b> ${esc(n.willingness_to_pay)} · <b>Concurrence :</b> ${esc(n.competition)}</p>
        <p class="ts">${esc(n.reasoning)}</p>${(n.sources || []).map((s) => `<a class="ts" href="${esc(s)}" target="_blank" rel="noopener">${esc(String(s).slice(0, 60))}</a>`).join(' · ')}</div>`).join('') || '<p>Aucune niche étudiée.</p>'}`;
    $('#nr').onclick = async () => { await api('/research', { focus: $('#nf').value }); toast('Nora est partie chercher — résultats dans quelques minutes'); };
  },

  async sales() {
    const [orders, leads] = await Promise.all([api('/orders'), api('/leads')]);
    $('#view').innerHTML = `<h1>Ventes & contacts</h1>
      <h2>Ventes (Stripe)</h2><table><tr><th>Date</th><th>Client</th><th>Offre</th><th>Montant</th><th>Statut</th></tr>
      ${orders.map((o) => `<tr><td class="ts">${fmtDate(o.ts)}</td><td>${esc(o.customer_name || '')}<br><span class="ts">${esc(o.customer_email)}</span></td><td>${esc(o.product || '')}</td><td><b>${euros(o.amount)}</b></td><td><span class="pill ok">${esc(o.status)}</span></td></tr>`).join('') || '<tr><td colspan="5">Pas encore de vente — on y travaille.</td></tr>'}</table>
      <h2>Contacts reçus via le site</h2><table><tr><th>Date</th><th>Contact</th><th>Offre</th><th>Message</th><th>Statut</th></tr>
      ${leads.map((l) => `<tr><td class="ts">${fmtDate(l.ts)}</td><td>${esc(l.name)}<br><span class="ts">${esc(l.email)} ${esc(l.phone || '')}</span></td><td>${esc(l.product || '')}</td><td>${esc(l.message)}</td>
        <td><select data-l="${l.id}">${['nouveau', 'recontacté', 'gagné', 'perdu'].map((s) => `<option ${s === l.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="5">Aucun contact pour l’instant.</td></tr>'}</table>`;
    document.querySelectorAll('[data-l]').forEach((s) => s.onchange = async () => { await api(`/leads/${s.dataset.l}`, { status: s.value }); toast('Mis à jour'); });
  },

  async activity() {
    const acts = await api('/activity?limit=300');
    $('#view').innerHTML = `<h1>Journal de l'équipe</h1><p class="sub">Tout ce que font les agents, en temps réel.</p><div class="panel feed">${feed(acts)}</div>`;
  },

  async settings() {
    const s = O.settings;
    const f = (k, label, type = 'text') => `<label>${label}</label><input name="${k}" type="${type}" value="${esc(s[k])}">`;
    const sel = (k, label, opts) => `<label>${label}</label><select name="${k}">${opts.map(([v, t]) => `<option value="${v}" ${s[k] === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
    const S = O.secrets;
    const key = (k, label, help, type = 'password') => `<label>${label} ${S[k] ? '<span class="pill ok">✓ enregistrée</span>' : '<span class="pill bad">à renseigner</span>'}</label>
      <input name="${k}" type="${type}" autocomplete="off" placeholder="${S[k] ? 'Déjà enregistrée — laisse vide pour garder' : esc(help)}">`;
    $('#view').innerHTML = `<h1>Paramètres</h1>
      <form id="kf" class="panel"><b>🔌 Connexions — colle tes clés ici, puis « Enregistrer les clés »</b>
        <p class="ts">Elles restent sur ton serveur, ne sont jamais réaffichées, et ne quittent ton application que vers le service concerné.</p>
        <h2>1. Les agents (Claude)</h2>
        ${key('ANTHROPIC_API_KEY', 'Clé API Anthropic', 'sk-ant-…')}
        <p class="ts">Où la trouver : <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com → API Keys</a> → « Create Key » → copie-la et colle-la ici.</p>
        <h2>2. Le paiement (Stripe)</h2>
        ${key('STRIPE_SECRET_KEY', 'Clé secrète Stripe', 'sk_test_… ou sk_live_…')}
        <p class="ts">Où la trouver : <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener">dashboard.stripe.com → Développeurs → Clés API</a> → « Clé secrète ». Commence avec la clé de test.</p>
        ${key('STRIPE_WEBHOOK_SECRET', 'Secret du webhook Stripe', 'whsec_…')}
        <p class="ts">Dans Stripe → Développeurs → Webhooks → « Ajouter un endpoint » : URL <code>${esc(O.webhookUrl)}</code>, événement <code>checkout.session.completed</code>, puis copie le « secret de signature ».</p>
        <h2>3. L'envoi d'emails (SMTP)</h2>
        <p class="ts">Ces informations sont données par ton fournisseur d'emails (Brevo, Mailjet, OVH, Google Workspace…), rubrique « SMTP ».</p>
        <div class="grid2"><div>${key('SMTP_HOST', 'Serveur SMTP', 'ex : smtp-relay.brevo.com', 'text')}</div><div><label>Port</label><input name="SMTP_PORT" value="${esc(O.smtpPort)}"></div>
        <div>${key('SMTP_USER', 'Identifiant SMTP', 'souvent ton adresse email', 'text')}</div><div>${key('SMTP_PASS', 'Mot de passe SMTP', 'mot de passe ou clé SMTP')}</div></div>
        ${key('MAIL_FROM', 'Expéditeur', 'ex : Prénom – VotreIAPro <contact@ton-domaine.fr>', 'text')}
        <div style="margin-top:12px"><button>Enregistrer les clés</button></div></form>
      <form id="sf" class="grid2">
        <div class="panel"><b>Entreprise (obligatoire avant tout envoi)</b>${f('brand_name', 'Nom de marque')}${f('company_name', 'Raison sociale')}${f('company_legal', 'Forme juridique et SIRET')}${f('company_address', 'Adresse')}${f('contact_email', 'Email de contact (reçoit les réponses)', 'email')}${f('founder_name', 'Ton prénom et nom (signature des emails)')}</div>
        <div class="panel"><b>Pilotage</b>
          ${sel('autopilot', 'Autopilote (cycles automatiques)', [['false', 'Désactivé — je lance les cycles'], ['true', 'Activé — un cycle toutes les CYCLE_HOURS heures']])}
          ${sel('email_mode', 'Validation des emails', [['validation', 'Je valide chaque email (recommandé)'], ['auto', 'Envoi automatique des emails rédigés']])}
          ${sel('sending_enabled', 'Envoi des emails', [['false', 'Coupé'], ['true', 'Activé']])}
          ${f('daily_email_limit', 'Limite d’emails par jour', 'number')}${f('prospects_per_cycle', 'Prospects recherchés par cycle', 'number')}${f('ads_budget_month', 'Budget pub mensuel autorisé (€)', 'number')}
          <label>Ta vision (guide toutes les décisions des agents)</label><textarea name="founder_vision" rows="4">${esc(s.founder_vision)}</textarea></div>
        <div><button>Enregistrer</button></div></form>`;
    $('#kf').onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries([...new FormData(e.target)].filter(([, v]) => String(v).trim()));
      await api('/settings', data); toast('Clés enregistrées ✓'); render();
    };
    $('#sf').onsubmit = async (e) => { e.preventDefault(); await api('/settings', Object.fromEntries(new FormData(e.target))); toast('Paramètres enregistrés'); render(); };
  },
};

function feed(acts) {
  return acts.map((a) => `<div class="item">${avatar(a.agent)}<div><div class="t">${esc(agent(a.agent).name)} · ${esc(a.title)}</div>${a.detail ? `<div class="d">${esc(String(a.detail).slice(0, 600))}</div>` : ''}<div class="ts">${fmtDate(a.ts)}</div></div></div>`).join('') || '<p class="ts">Rien pour le moment.</p>';
}

async function meeting(id) {
  const m = await api(`/meetings/${id}`);
  $('#view').innerHTML = `<button class="ghost" onclick="go('meetings')">← Réunions</button>
    <h1 style="margin-top:12px">${esc(m.topic)}</h1><p class="sub">${fmtDate(m.ts)} · <span class="pill ${m.status === 'terminée' ? 'ok' : 'warn'}">${esc(m.status)}</span></p>
    <div class="panel transcript">${m.transcript.map((t) => `<div class="line">${avatar(t.agent)}<div><div class="who">${esc(agent(t.agent).name)} <span class="ts">${esc(agent(t.agent).role)}</span></div><div class="txt">${esc(t.text)}</div></div></div>`).join('') || '<p class="ts"><span class="spin">⟳</span> La réunion commence…</p>'}</div>
    ${m.summary ? `<div class="panel"><b>Résumé</b><p>${esc(m.summary)}</p><b>Décisions</b><ul>${(m.decisions || []).map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div>` : ''}
    <div class="panel"><b>Ton avis sur cette réunion</b><p class="ts">Il sera pris en compte par toute l'équipe dans les prochains cycles et réunions.</p>
      <textarea id="cm" rows="3">${esc(m.founder_comment || '')}</textarea><button id="sv" style="margin-top:8px">Donner mon avis</button></div>`;
  $('#sv').onclick = async () => { await api(`/meetings/${id}/comment`, { comment: $('#cm').value }); toast('Avis transmis à l’équipe'); };
  if (m.status !== 'terminée') setTimeout(() => { if (tab === 'meetings' && $('.transcript')) meeting(id); }, 4000);
}

// Rafraîchissement automatique pendant que l'équipe travaille
setInterval(async () => {
  if (['dashboard', 'activity'].includes(tab) && !document.activeElement?.matches('input,textarea')) render();
}, 8000);

render();
