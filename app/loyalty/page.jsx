'use client';

// Customers see their punch card after proving their phone number with a
// texted code. The browser stays signed in for 30 days.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PhoneVerify from '@/components/site/PhoneVerify';
import PunchCard from '@/components/site/PunchCard';
import SimpleHeader from '@/components/site/SimpleHeader';

export default function LoyaltyPage() {
    const [rewards, setRewards] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch('/api/loyalty', { cache: 'no-store' })
            .then(async (r) => {
                const body = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(body.error ?? 'Please try again.');
                setRewards(body);
            })
            .catch((e) => setError(e.message));
    }, []);

    async function signOut() {
        const response = await fetch('/api/loyalty', { method: 'DELETE' });
        setRewards(await response.json().catch(() => ({ enabled: true, phone: null })));
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

                <div className='mt-6' aria-live='polite'>
                    {error && (
                        <p role='alert' className='rounded-2xl bg-red-50 p-3 text-sm text-red-800'>
                            {error}
                        </p>
                    )}
                    {!rewards && !error && <p className='text-moon-muted'>Loading…</p>}
                    {rewards && !rewards.enabled && (
                        <p className='rounded-2xl bg-white p-4 ring-1 ring-moon-caramel/30'>
                            Checking your stamps online is coming soon. Your stamps still count: ask at the stand and we&apos;ll look them up.
                        </p>
                    )}
                    {rewards?.enabled && !rewards.phone && (
                        <PhoneVerify onVerified={setRewards} sendLabel='Text me a code to see my stamps' />
                    )}
                    {rewards?.phone && rewards.card && (
                        <div className='space-y-4'>
                            <PunchCard card={rewards.card} />
                            {rewards.card.rewardsAvailable > 0 && (
                                <p className='text-sm text-moon-muted'>
                                    Claim it at the stand, or tick &ldquo;Use my free drink&rdquo; when you{' '}
                                    <Link href='/order/online' className='font-bold text-moon-orange underline'>
                                        order ahead
                                    </Link>
                                    .
                                </p>
                            )}
                            <p className='flex flex-wrap items-center justify-between gap-2 text-sm'>
                                <span>
                                    Signed in as <strong>{rewards.display}</strong>
                                </span>
                                <button type='button' onClick={signOut} className='font-bold text-moon-orange underline'>
                                    Sign out
                                </button>
                            </p>
                        </div>
                    )}
                </div>

                <p className='mt-8 text-xs text-moon-muted'>
                    We only show stamp counts here, never your orders or other details.
                </p>
            </div>
        </>
    );
}
