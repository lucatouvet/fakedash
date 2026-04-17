// netlify/functions/create-checkout.js
// Creates a Stripe Checkout session and returns the URL

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { userId, email, priceId } = body;

  if (!userId || !email || !priceId) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        supabase_user_id: userId, // passed to webhook → activates subscription
      },
      success_url: `${process.env.SITE_URL}/dashboard.html?checkout=success`,
      cancel_url: `${process.env.SITE_URL}/index.html#pricing`,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('Stripe error:', err);
    return { statusCode: 500, body: err.message };
  }
};
