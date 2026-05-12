// Deploy this as a Supabase Edge Function:
//   supabase functions deploy stripe-connection-token
//
// Set secrets:
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_...

import Stripe from 'https://esm.sh/stripe@14.x';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (_req) => {
  const token = await stripe.terminal.connectionTokens.create({});
  return new Response(JSON.stringify({ secret: token.secret }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
