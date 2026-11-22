// Rendu du site public (pages de vente générées par Sam, pages légales).
import { getSettings, parseJSON } from './db.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euros = (n) => `${Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`;

export function layout(title, body, { description = '' } = {}) {
  const s = getSettings();
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${esc(s.brand_name)}</title><meta name="description" content="${esc(description)}">
<link rel="stylesheet" href="/site.css"></head><body>
<header class="top"><div class="wrap"><a href="/" class="brand">${esc(s.brand_name)}</a><nav><a href="/#offres">Offres</a><a href="/#contact">Contact</a></nav></div></header>
<main>${body}</main>
<footer class="foot"><div class="wrap"><span>© ${new Date().getFullYear()} ${esc(s.company_name || s.brand_name)}</span>
<nav><a href="/mentions-legales">Mentions légales</a><a href="/cgv">CGV</a><a href="/confidentialite">Confidentialité</a></nav></div></footer>
</body></html>`;
}

export function renderHome(products) {
  const s = getSettings();
  const cards = products.map((p) => `<a class="card" href="/offre/${esc(p.slug)}"><span class="tag">${esc(p.niche)}</span><h3>${esc(p.name)}</h3><p>${esc(p.tagline)}</p>
    <strong>${euros(p.price_setup)} puis ${euros(p.price_monthly)}/mois</strong></a>`).join('');
  return layout('Services numériques pour professionnels', `
  <section class="hero"><div class="wrap"><h1>Des outils numériques qui font venir des clients aux professionnels.</h1>
  <p class="lead">${esc(s.brand_name)} conçoit pour les avocats, artisans et professions libérales des sites, automatisations et assistants IA livrés clés en main.</p>
  <a class="btn" href="#offres">Voir les offres</a></div></section>
  <section id="offres" class="wrap"><h2>Nos offres</h2><div class="grid">${cards || '<p>Nos offres arrivent très bientôt.</p>'}</div></section>
  ${contactForm(null)}`);
}

export function renderProduct(p) {
  const L = parseJSON(p.landing, {}) || {};
  const deliverables = parseJSON(p.deliverables, []) || [];
  const list = (arr, f) => (Array.isArray(arr) ? arr.map(f).join('') : '');
  return layout(p.name, `
  <section class="hero"><div class="wrap"><span class="tag">${esc(p.niche)}</span><h1>${esc(L.hero_title || p.name)}</h1>
  <p class="lead">${esc(L.hero_subtitle || p.tagline)}</p>
  <form method="post" action="/api/checkout/${esc(p.slug)}"><button class="btn">${esc(L.cta || 'Commander')}</button></form>
  <p class="small">${euros(p.price_setup)} de mise en place, puis ${euros(p.price_monthly)}/mois · paiement sécurisé par Stripe</p></div></section>
  ${L.problems ? `<section class="wrap"><h2>Vous reconnaissez-vous ?</h2><ul class="checks">${list(L.problems, (x) => `<li>${esc(x)}</li>`)}</ul></section>` : ''}
  ${L.benefits ? `<section class="wrap"><h2>Ce que ça change pour vous</h2><div class="grid">${list(L.benefits, (b) => `<div class="card"><h3>${esc(b.title)}</h3><p>${esc(b.text)}</p></div>`)}</div></section>` : ''}
  ${L.process ? `<section class="wrap"><h2>Comment ça se passe</h2><ol class="steps">${list(L.process, (x) => `<li><strong>${esc(x.step)}</strong><span>${esc(x.text)}</span></li>`)}</ol></section>` : ''}
  <section class="wrap"><h2>Inclus dans l’offre</h2><ul class="checks">${list(deliverables, (x) => `<li>${esc(x)}</li>`)}</ul>
  <div class="price"><div><strong>${euros(p.price_setup)}</strong> mise en place</div><div><strong>${euros(p.price_monthly)}</strong> / mois</div>
  <form method="post" action="/api/checkout/${esc(p.slug)}"><button class="btn">${esc(L.cta || 'Commander')}</button></form></div>
  ${L.guarantee ? `<p class="guarantee">🛡️ ${esc(L.guarantee)}</p>` : ''}</section>
  ${L.faq ? `<section class="wrap"><h2>Questions fréquentes</h2>${list(L.faq, (f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`)}</section>` : ''}
  ${contactForm(p)}`, { description: p.tagline });
}

function contactForm(p) {
  return `<section id="contact" class="wrap contact"><h2>Une question ? Parlons-en.</h2>
  <form method="post" action="/api/lead">${p ? `<input type="hidden" name="product_id" value="${p.id}">` : ''}
  <input name="name" placeholder="Nom" required><input name="email" type="email" placeholder="Email professionnel" required>
  <input name="phone" placeholder="Téléphone (facultatif)"><textarea name="message" placeholder="Votre besoin" rows="4"></textarea>
  <label class="small"><input type="checkbox" required> J’accepte que mes données soient utilisées pour me recontacter (voir la politique de confidentialité).</label>
  <button class="btn">Être recontacté</button></form></section>`;
}

export function renderLegal(kind) {
  const s = getSettings();
  const id = `<strong>${esc(s.company_name || '[Nom de l’entreprise — à compléter]')}</strong><br>${esc(s.company_legal || '[Forme juridique, SIRET — à compléter]')}<br>${esc(s.company_address || '[Adresse — à compléter]')}<br>Contact : ${esc(s.contact_email || '[email — à compléter]')}`;
  const pages = {
    'mentions-legales': ['Mentions légales', `<p>Éditeur du site :<br>${id}</p><p>Directeur de la publication : ${esc(s.founder_name || '[à compléter]')}</p><p>Hébergement : [nom, adresse et téléphone de l’hébergeur — à compléter].</p>`],
    cgv: ['Conditions générales de vente', `<p>Vendeur : ${id}</p><h3>Objet</h3><p>Les présentes conditions régissent la vente de services numériques aux professionnels (B2B).</p><h3>Prix et paiement</h3><p>Les prix sont indiqués en euros. Le paiement s’effectue en ligne via Stripe. L’abonnement mensuel est prélevé automatiquement et peut être résilié selon les modalités indiquées sur la page de l’offre.</p><h3>Livraison</h3><p>Les délais de livraison sont précisés sur chaque offre et courent à compter de la réception des éléments nécessaires fournis par le client.</p><h3>Responsabilité</h3><p>Le prestataire est tenu d’une obligation de moyens.</p><h3>Litiges</h3><p>Droit français. Tribunaux compétents du siège du vendeur.</p><p class="small">Modèle à faire relire par un professionnel avant usage commercial.</p>`],
    confidentialite: ['Politique de confidentialité', `<p>Responsable de traitement : ${id}</p><p>Données traitées : coordonnées professionnelles publiques (prospection B2B, base légale : intérêt légitime) et données transmises via les formulaires (base légale : consentement / mesures précontractuelles). Paiements traités par Stripe.</p><p>Durée de conservation : 3 ans maximum après le dernier contact. Vous pouvez à tout moment vous opposer à la prospection (lien de désinscription dans chaque email), et exercer vos droits d’accès, rectification et effacement en écrivant à ${esc(s.contact_email || '[email]')}. Réclamation possible auprès de la CNIL.</p>`],
  };
  const [title, body] = pages[kind];
  return layout(title, `<section class="wrap legal"><h1>${title}</h1>${body}</section>`);
}

export const simplePage = (title, text) => layout(title, `<section class="wrap legal"><h1>${esc(title)}</h1><p>${esc(text)}</p><p><a class="btn" href="/">Retour à l’accueil</a></p></section>`);
