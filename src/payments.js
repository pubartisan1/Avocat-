// Paiement Stripe : création de sessions Checkout et réception des webhooks.
import Stripe from 'stripe';
import { get, insert, run, log } from './db.js';

export const hasStripe = () => Boolean(process.env.STRIPE_SECRET_KEY);
let stripe = null;
const getStripe = () => (stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY));

export async function createCheckout(product) {
  const base = process.env.PUBLIC_URL || 'http://localhost:3000';
  const line_items = [];
  const monthly = Number(product.price_monthly || 0);
  const setup = Number(product.price_setup || 0);
  if (monthly > 0) {
    line_items.push({ quantity: 1, price_data: { currency: 'eur', unit_amount: Math.round(monthly * 100), recurring: { interval: 'month' }, product_data: { name: `${product.name} — abonnement mensuel` } } });
  }
  if (setup > 0) {
    line_items.push({ quantity: 1, price_data: { currency: 'eur', unit_amount: Math.round(setup * 100), product_data: { name: `${product.name} — mise en place` } } });
  }
  const session = await getStripe().checkout.sessions.create({
    mode: monthly > 0 ? 'subscription' : 'payment',
    line_items,
    success_url: `${base}/merci?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/offre/${product.slug}`,
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    metadata: { product_id: String(product.id) },
    locale: 'fr',
  });
  return session.url;
}

export function handleWebhook(rawBody, signature) {
  let event;
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    event = getStripe().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } else {
    throw new Error('STRIPE_WEBHOOK_SECRET manquant : webhook refusé par sécurité.');
  }
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    if (!get('SELECT id FROM orders WHERE stripe_session = ?', s.id)) {
      const productId = Number(s.metadata?.product_id) || null;
      const id = insert('orders', {
        product_id: productId, stripe_session: s.id,
        customer_email: s.customer_details?.email, customer_name: s.customer_details?.name,
        amount: (s.amount_total || 0) / 100, currency: s.currency, status: 'payé',
      });
      if (s.customer_details?.email) run("UPDATE prospects SET status = 'client' WHERE lower(email) = lower(?)", s.customer_details.email);
      log('ines', 'vente', `💶 Nouvelle vente : ${(s.amount_total || 0) / 100} ${String(s.currency).toUpperCase()}`, `Client : ${s.customer_details?.name || ''} <${s.customer_details?.email || ''}>`);
      return { orderId: id, productId };
    }
  }
  return null;
}
