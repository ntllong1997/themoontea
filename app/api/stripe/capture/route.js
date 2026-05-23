import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
    try {
        const { paymentIntentId } = await req.json();
        const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);
        return Response.json({ status: paymentIntent.status });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}
