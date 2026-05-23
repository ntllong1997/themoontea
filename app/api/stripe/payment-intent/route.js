import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
    try {
        const { amount } = await req.json();
        const paymentIntent = await stripe.paymentIntents.create({
            amount:               Math.round(amount * 100), // dollars → cents
            currency:             'usd',
            payment_method_types: ['card_present'],
            capture_method:       'manual',
        });
        return Response.json({ clientSecret: paymentIntent.client_secret, id: paymentIntent.id });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}
