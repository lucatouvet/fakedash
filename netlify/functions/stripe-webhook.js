// netlify/functions/stripe-webhook.js
// Handles Stripe events: subscription created, updated, deleted

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // service key for server-side writes
);

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const session = stripeEvent.data.object;

  switch (stripeEvent.type) {

    // ── Payment completed → activate subscription ──
    case 'checkout.session.completed': {
      const customerId = session.customer;
      const subscriptionId = session.subscription;
      const userId = session.metadata?.supabase_user_id;

      if (!userId) {
        console.error('No supabase_user_id in session metadata');
        break;
      }

      const { error } = await sb.from('subscribers').upsert({
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        active: true,
      }, { onConflict: 'user_id' });

      if (error) console.error('Supabase upsert error:', error);
      else console.log('Activated subscription for user:', userId);
      break;
    }

    // ── Subscription renewed ──
    case 'invoice.payment_succeeded': {
      const subscriptionId = session.subscription;
      if (!subscriptionId) break;

      const { error } = await sb.from('subscribers')
        .update({ active: true })
        .eq('stripe_subscription_id', subscriptionId);

      if (error) console.error('Renewal update error:', error);
      break;
    }

    // ── Payment failed or subscription cancelled ──
    case 'customer.subscription.deleted':
    case 'invoice.payment_failed': {
      const subscriptionId = session.id || session.subscription;

      const { error } = await sb.from('subscribers')
        .update({ active: false })
        .eq('stripe_subscription_id', subscriptionId);

      if (error) console.error('Deactivation error:', error);
      else console.log('Deactivated subscription:', subscriptionId);
      break;
    }

    default:
      console.log('Unhandled event type:', stripeEvent.type);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
