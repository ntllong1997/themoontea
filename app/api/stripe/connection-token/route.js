import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST() {
    try {
        const token = await stripe.terminal.connectionTokens.create();
        return Response.json({ secret: token.secret });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}
