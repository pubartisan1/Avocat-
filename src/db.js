// Base de données.
// - En ligne (hébergement gratuit) : base Turso, qui ne s'efface jamais (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN).
// - Sinon : fichier local data/qg.db.
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH || path.resolve('data/qg.db');
const remote = Boolean(process.env.TURSO_DATABASE_URL);
if (!remote) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = createClient(remote
  ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
  : { url: `file:${DB_PATH}` });
export const dbKind = remote ? 'Turso (permanente)' : 'fichier local';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), agent TEXT, type TEXT, title TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS niches (
  id INTEGER PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), name TEXT, sector TEXT, problem TEXT,
  offer_idea TEXT, audience TEXT, willingness_to_pay TEXT, competition TEXT, score REAL,
  reasoning TEXT, sources TEXT);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), slug TEXT UNIQUE, name TEXT, niche TEXT,
  target TEXT, tagline TEXT, description TEXT, price_setup REAL, price_monthly REAL,
  deliverables TEXT, landing TEXT, status TEXT DEFAULT 'brouillon', meeting_id INTEGER);
CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), topic TEXT, status TEXT DEFAULT 'en cours',
  transcript TEXT DEFAULT '[]', summary TEXT, decisions TEXT, founder_comment TEXT);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), thread TEXT, sender TEXT, text TEXT);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), agent TEXT, question TEXT, context TEXT,
  answer TEXT, answered_ts TEXT, status TEXT DEFAULT 'en attente');
CREATE TABLE IF NOT EXISTS prospects (
  id INTEGER PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), name TEXT, company TEXT, role TEXT,
  email TEXT, phone TEXT, city TEXT, website TEXT, source_url TEXT, personalization TEXT,
  product_id INTEGER, status TEXT DEFAULT 'nouveau', notes TEXT, unsubscribed INTEGER DEFAULT 0,
  demo INTEGER DEFAULT 0, token TEXT, UNIQUE(email));
CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), prospect_id INTEGER, product_id INTEGER,
  step INTEGER DEFAULT 1, subject TEXT, body TEXT, status TEXT DEFAULT 'brouillon',
  send_after TEXT, sent_ts TEXT, error TEXT);
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), product_id INTEGER, channel TEXT,
  name TEXT, budget TEXT, plan TEXT, status TEXT DEFAULT 'proposée');
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), product_id INTEGER, stripe_session TEXT UNIQUE,
  customer_email TEXT, customer_name TEXT, amount REAL, currency TEXT, status TEXT);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), product_id INTEGER, name TEXT, email TEXT,
  phone TEXT, message TEXT, status TEXT DEFAULT 'nouveau');
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), kind TEXT, status TEXT DEFAULT 'en cours',
  step TEXT, error TEXT, finished_ts TEXT);
`;

const clean = (args) => args.map((a) => (a === undefined ? null : a));
export async function all(sql, ...args) {
  const r = await db.execute({ sql, args: clean(args) });
  return r.rows.map((row) => Object.fromEntries(r.columns.map((c) => [c, row[c]])));
}
export const get = async (sql, ...args) => (await all(sql, ...args))[0];
export async function run(sql, ...args) {
  const r = await db.execute({ sql, args: clean(args) });
  return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid };
}

export async function insert(table, obj) {
  const keys = Object.keys(obj);
  const vals = keys.map((k) => normalize(obj[k]));
  const r = await run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...vals);
  return Number(r.lastInsertRowid);
}

export async function update(table, id, obj) {
  const keys = Object.keys(obj);
  if (!keys.length) return;
  await run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => normalize(obj[k])), id);
}

function normalize(v) {
  if (v === undefined) return null;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

export function parseJSON(s, fallback = null) {
  if (s == null) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

// ---- Paramètres ----
const DEFAULT_SETTINGS = {
  brand_name: 'VotreIAPro',
  autopilot: 'false',            // cycles automatiques
  email_mode: 'validation',      // 'validation' = le fondateur valide chaque email ; 'auto' = envoi automatique
  sending_enabled: 'false',      // interrupteur général d'envoi
  daily_email_limit: '30',
  prospects_per_cycle: '15',
  company_name: '',
  company_legal: '',             // forme juridique + SIRET
  company_address: '',
  contact_email: '',
  founder_name: '',
  founder_vision: "Construire une entreprise rentable qui vend des services numériques à forte valeur à des professionnels (avocats, artisans, médecins...), avec des agents IA qui ne lâchent jamais.",
  ads_budget_month: '300',
};

// Les paramètres sont gardés en mémoire (lecture instantanée) et enregistrés en base à chaque changement.
let SETTINGS = {};

/** À appeler une fois au démarrage. */
export async function initDb() {
  await db.executeMultiple(SCHEMA);
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', k, v);
  }
  SETTINGS = Object.fromEntries((await all('SELECT key, value FROM settings')).map((r) => [r.key, r.value]));
}

export function getSettings() {
  return { ...SETTINGS };
}
export async function setSetting(key, value) {
  SETTINGS[key] = String(value);
  await run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value));
}

/** Journal d'activité (n'interrompt jamais le travail en cas d'erreur d'écriture). */
export function log(agent, type, title, detail = '') {
  return insert('activity', { agent, type, title, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) })
    .catch((e) => console.error('journal :', e.message));
}

// ---- Clés de connexion : saisies dans le back-office (Paramètres) ou, à défaut, variables d'environnement ----
export const SECRET_KEYS = ['ANTHROPIC_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'];
export function secret(name) {
  const v = SETTINGS[`secret_${name}`];
  return (v && v.trim()) || process.env[name] || '';
}
export function baseUrl() {
  return (SETTINGS.public_url || process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
}
