// Accès au modèle Claude pour tous les agents.
// Sans clé ANTHROPIC_API_KEY, l'application tourne en « mode démo » avec des réponses d'exemple
// (rien n'est envoyé à de vrais prospects en mode démo).
import Anthropic from '@anthropic-ai/sdk';
import { MOCKS } from './mocks.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
let client = null;

export const hasLLM = () => Boolean(process.env.ANTHROPIC_API_KEY);
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Pose une question à un agent.
 * @returns {Promise<{text: string, sources: {url: string, title: string}[]}>}
 */
export async function ask({ system, prompt, webSearch = false, maxSearches = 6, effort = 'medium', maxTokens = 32000, mock }) {
  if (!hasLLM()) {
    const m = typeof mock === 'function' ? mock() : mock;
    await new Promise((r) => setTimeout(r, 400));
    return { text: typeof m === 'string' ? m : JSON.stringify(m ?? MOCKS.generic), sources: [], demo: true };
  }

  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    thinking: { type: 'adaptive' },
    output_config: { effort },
  };
  if (process.env.CLAUDE_FALLBACKS !== 'off') {
    // Si le modèle refuse une requête, l'API relance automatiquement sur un modèle de secours.
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  if (webSearch) params.tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches }];

  const user = { role: 'user', content: prompt };
  let assistantContent = [];
  let resp;
  for (let i = 0; i < 6; i++) {
    const messages = assistantContent.length ? [user, { role: 'assistant', content: assistantContent }] : [user];
    resp = await getClient().beta.messages.stream({ ...params, messages }).finalMessage();
    assistantContent = [...assistantContent, ...resp.content];
    if (resp.stop_reason !== 'pause_turn') break; // recherche web longue : on laisse le serveur reprendre
  }
  if (resp.stop_reason === 'refusal') {
    throw new Error(`Le modèle a refusé la demande (${resp.stop_details?.category ?? 'raison non précisée'}).`);
  }

  const text = assistantContent.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  const sources = [];
  for (const b of assistantContent) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) if (r.url) sources.push({ url: r.url, title: r.title || r.url });
    }
  }
  return { text, sources: dedupe(sources) };
}

/** Même chose mais en exigeant une réponse JSON (analysée et validée). */
export async function askJSON(opts) {
  const prompt = `${opts.prompt}\n\nFORMAT DE SORTIE : réponds UNIQUEMENT avec un JSON valide (sans texte autour, sans balises markdown).`;
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await ask({ ...opts, prompt: attempt ? `${prompt}\n\nATTENTION : ta réponse précédente n'était pas un JSON valide. Recommence.` : prompt });
    try {
      return { data: extractJSON(r.text), sources: r.sources };
    } catch (e) { last = e; }
  }
  throw new Error(`Réponse JSON invalide : ${last?.message}`);
}

export function extractJSON(text) {
  const cleaned = text.replace(/```(?:json)?/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* on cherche le premier bloc JSON */ }
  const start = cleaned.search(/[[{]/);
  if (start === -1) throw new Error('aucun JSON trouvé');
  const open = cleaned[start];
  const close = open === '{' ? '}' : ']';
  const end = cleaned.lastIndexOf(close);
  return JSON.parse(cleaned.slice(start, end + 1));
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((s) => (seen.has(s.url) ? false : seen.add(s.url)));
}
