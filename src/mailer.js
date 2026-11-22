// Envoi des emails de prospection : SMTP, limites quotidiennes, désinscription, mentions obligatoires.
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { all, get, run, update, getSettings, log, secret, baseUrl } from './db.js';

export const hasSMTP = () => Boolean(secret('SMTP_HOST') && secret('MAIL_FROM'));
let transport = null;
let transportKey = '';
function getTransport() {
  const cfg = { host: secret('SMTP_HOST'), port: Number(secret('SMTP_PORT') || 587), user: secret('SMTP_USER'), pass: secret('SMTP_PASS') };
  const key = JSON.stringify(cfg);
  if (!transport || key !== transportKey) {
    transport = nodemailer.createTransport({
      host: cfg.host, port: cfg.port, secure: cfg.port === 465,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
    transportKey = key;
  }
  return transport;
}

export function prospectToken(prospect) {
  if (prospect.token) return prospect.token;
  const token = crypto.randomBytes(16).toString('hex');
  run('UPDATE prospects SET token = ? WHERE id = ?', token, prospect.id);
  return token;
}

function footer(s, token) {
  const base = baseUrl();
  const identity = [s.company_name || s.brand_name, s.company_legal, s.company_address].filter(Boolean).join(' — ');
  return `\n\n--\n${identity}\nVous recevez ce message car votre adresse professionnelle est publiée publiquement et que notre offre concerne votre activité.\nNe plus recevoir de messages : ${base}/desabonnement?t=${token}`;
}

export function sentToday() {
  return get("SELECT COUNT(*) AS n FROM emails WHERE status = 'envoyé' AND date(sent_ts) = date('now')").n;
}

/** Envoie les emails approuvés dont la date d'envoi est passée, dans la limite quotidienne. */
export async function processQueue() {
  const s = getSettings();
  if (s.sending_enabled !== 'true') return { sent: 0, reason: "L'envoi est désactivé dans les paramètres." };
  if (!hasSMTP()) return { sent: 0, reason: 'SMTP non configuré.' };
  const missing = ['company_name', 'company_address', 'contact_email'].filter((k) => !s[k]);
  if (missing.length) return { sent: 0, reason: `Informations légales manquantes : ${missing.join(', ')}.` };

  const remaining = Number(s.daily_email_limit || 30) - sentToday();
  if (remaining <= 0) return { sent: 0, reason: 'Limite quotidienne atteinte.' };

  const queue = all(`SELECT e.*, p.email AS to_email, p.unsubscribed, p.demo, p.status AS p_status
    FROM emails e JOIN prospects p ON p.id = e.prospect_id
    WHERE e.status = 'approuvé' AND (e.send_after IS NULL OR e.send_after <= datetime('now'))
    ORDER BY e.step, e.id LIMIT ?`, remaining);

  let sent = 0;
  for (const e of queue) {
    const prospect = get('SELECT * FROM prospects WHERE id = ?', e.prospect_id);
    if (e.unsubscribed || e.demo || ['a répondu', 'client', 'pas intéressé'].includes(e.p_status)) {
      update('emails', e.id, { status: 'annulé', error: e.demo ? 'Prospect de démonstration' : 'Prospect désinscrit ou déjà en discussion' });
      continue;
    }
    try {
      await getTransport().sendMail({
        from: secret('MAIL_FROM'),
        to: e.to_email,
        replyTo: s.contact_email || undefined,
        subject: e.subject,
        text: e.body + footer(s, prospectToken(prospect)),
        headers: { 'List-Unsubscribe': `<${baseUrl()}/desabonnement?t=${prospectToken(prospect)}>` },
      });
      update('emails', e.id, { status: 'envoyé', sent_ts: new Date().toISOString().replace('T', ' ').slice(0, 19), error: null });
      if (prospect.status === 'nouveau') update('prospects', prospect.id, { status: 'contacté' });
      sent++;
      await new Promise((r) => setTimeout(r, 4000)); // espacement pour la délivrabilité
    } catch (err) {
      update('emails', e.id, { status: 'échec', error: String(err.message || err) });
    }
  }
  if (sent) log('clara', 'email', `${sent} email(s) envoyé(s)`);
  return { sent };
}
