'use client';

// Customers check their punch card by phone number.

import { useState } from 'react';
import Link from 'next/link';
import PunchCard from '@/components/site/PunchCard';
import SimpleHeader from '@/components/site/SimpleHeader';

export default function LoyaltyPage() {
    const [phone, setPhone] = useState('');
    const [card, setCard] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    async function lookUp(event) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/loyalty', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error ?? 'Please try again.');
            setCard(body.card);
        } catch (e) {
            setCard(null);
            setError(e.message);
        }
        setBusy(false);
    }

    return (
        <>
            <SimpleHeader links={[{ href: '/menu', label: 'Menu' }, { href: '/order/online', label: 'Order ahead' }]} />
            <div className='mx-auto max-w-md px-4 py-8'>
                <h1 className='leading-none'>
                    <span className='block font-script text-2xl text-moon-orange'>Moon Rewards</span>
                    <span className='font-display text-4xl'>Your punch card</span>
                </h1>
                <p className='mt-3 text-moon-muted'>
                    Every boba drink earns a stamp. Collect 9 and your 10th drink is free. Just give your phone
                    number when you order, at the stand or online.
                </p>

                <form onSubmit={lookUp} className='mt-6 space-y-3'>
                    <label htmlFor='loyalty-phone' className='block text-sm font-bold'>
                        Phone number
                    </label>
                    <input
                        id='loyalty-phone'
                        type='tel'
                        inputMode='tel'
                        autoComplete='tel'
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder='(956) 555-0123'
                        className='w-full rounded-2xl border border-moon-caramel/50 bg-white px-4 py-3 text-lg focus:border-moon-ink focus:outline-none focus:ring-2 focus:ring-blue-600'
                    />
                    <button
                        type='submit'
                        disabled={busy || phone.replace(/\D/g, '').length < 10}
                        className='w-full rounded-full bg-moon-ink py-3 font-bold text-white transition hover:bg-moon-orange disabled:opacity-40'
                    >
                        {busy ? 'Checking…' : 'Check my stamps'}
                    </button>
                </form>

                {error && (
                    <p role='alert' className='mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-800'>
                        {error}
                    </p>
                )}

                {card && (
                    <div className='mt-6 space-y-4'>
                        <PunchCard card={card} />
                        {card.rewardsAvailable > 0 && (
                            <p className='text-sm text-moon-muted'>
                                Claim it by giving this number at the stand, or tick &ldquo;Use my free drink&rdquo; when you{' '}
                                <Link href='/order/online' className='font-bold text-moon-orange underline'>
                                    order ahead
                                </Link>
                                .
                            </p>
                        )}
                    </div>
                )}

                <p className='mt-8 text-xs text-moon-muted'>
                    We only show stamp counts here, never your orders or other details.
                </p>
            </div>
        </>
    );
}
