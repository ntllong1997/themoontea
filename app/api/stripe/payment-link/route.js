import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
    try {
        const { amount, orderNumber } = await req.json();

        const price = await stripe.prices.create({
            currency:     'usd',
            unit_amount:  Math.round(amount * 100),
            product_data: { name: `The Moon Tea — Order #${orderNumber}` },
        });

        const link = await stripe.paymentLinks.create({
            line_items:          [{ price: price.id, quantity: 1 }],
            after_completion:    { type: 'hosted_confirmation', hosted_confirmation: { custom_message: 'Thank you! Enjoy your order 🧡' } },
        });

        return Response.json({ url: link.url });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}
