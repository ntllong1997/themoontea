'use client';

// Staff look up a customer's punch card by phone and give out a free drink
// at the stand. Giving one here records it, so it can't be claimed twice;
// ring the drink up on the till as usual and take it off the total.

import { useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import { api, jsonRequest } from '@/lib/site/adminApi';
import { formatPhone, normalizePhone } from '@/lib/online/loyalty';

const inputClass =
    'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-lg focus:border-black focus:outline-none focus:ring-2 focus:ring-blue-600';

export default function AdminLoyaltyPage() {
    const [phone, setPhone] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState('');

    const digits = normalizePhone(phone);

    async function lookUp(event) {
        event?.preventDefault();
        if (!digits) return setError('Enter a 10-digit phone number.');
        setBusy(true);
        setError('');
        setDone('');
        try {
            setResult({ digits, ...(await api(`/api/admin/loyalty?phone=${digits}`)) });
        } catch (e) {
            setResult(null);
            setError(e.message);
        }
        setBusy(false);
    }

    async function redeem() {
        if (!window.confirm(`Give a free drink to ${formatPhone(result.digits)}?`)) return;
        setBusy(true);
        setError('');
        try {
            const { card } = await api('/api/admin/loyalty', jsonRequest('POST', { phone: result.digits }));
            setResult((r) => ({ ...r, card, redemptions: [{ source: 'staff', created_at: new Date().toISOString() }, ...(r.redemptions ?? [])] }));
            setDone('Free drink recorded. Ring it up on the till and take it off the total.');
        } catch (e) {
            setError(e.message);
        }
        setBusy(false);
    }

    return (
        <AdminShell active='loyalty' title='Rewards Lookup'>
            <div className='mx-auto max-w-3xl space-y-4 px-4 pt-4'>
                <p className='text-sm text-gray-600'>
                    Every paid boba drink with a phone number earns a stamp, at the till or online. 9 stamps = the next drink free.
                </p>
                <form onSubmit={lookUp} className='flex gap-2'>
                    <label htmlFor='staff-loyalty-phone' className='sr-only'>
                        Customer phone number
                    </label>
                    <input
                        id='staff-loyalty-phone'
                        type='tel'
                        inputMode='tel'
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder='Customer phone number'
                        className={inputClass}
                    />
                    <button type='submit' disabled={busy || !digits} className='rounded-xl bg-black px-5 font-semibold text-white hover:opacity-80 disabled:opacity-40'>
                        Look up
                    </button>
                </form>

                {error && (
                    <p role='alert' className='rounded-2xl bg-red-50 p-4 text-sm text-red-800'>
                        {error}
                    </p>
                )}

                {result && (
                    <section aria-labelledby='loyalty-result' className='rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200'>
                        <h2 id='loyalty-result' className='text-lg font-bold'>
                            {formatPhone(result.digits)}
                        </h2>
                        <dl className='mt-3 grid grid-cols-3 gap-3 text-center'>
                            <div className='rounded-xl bg-gray-50 p-3'>
                                <dt className='text-xs font-semibold uppercase text-gray-600'>Stamps</dt>
                                <dd className='text-2xl font-bold'>
                                    {result.card.stamps}/{result.card.perReward}
                                </dd>
                            </div>
                            <div className='rounded-xl bg-gray-50 p-3'>
                                <dt className='text-xs font-semibold uppercase text-gray-600'>Free drinks ready</dt>
                                <dd className='text-2xl font-bold'>{result.card.rewardsAvailable}</dd>
                            </div>
                            <div className='rounded-xl bg-gray-50 p-3'>
                                <dt className='text-xs font-semibold uppercase text-gray-600'>Drinks so far</dt>
                                <dd className='text-2xl font-bold'>{result.card.totalDrinks}</dd>
                            </div>
                        </dl>
                        <button
                            type='button'
                            onClick={redeem}
                            disabled={busy || result.card.rewardsAvailable < 1}
                            className='mt-4 w-full rounded-xl bg-green-700 py-3 font-semibold text-white hover:opacity-90 disabled:bg-gray-300 disabled:text-gray-700'
                        >
                            {result.card.rewardsAvailable < 1 ? 'No free drink ready yet' : '🎁 Give a free drink'}
                        </button>
                        {done && (
                            <p role='status' className='mt-3 text-sm font-semibold text-green-800'>
                                {done}
                            </p>
                        )}
                        {result.redemptions?.length > 0 && (
                            <div className='mt-4'>
                                <h3 className='text-sm font-semibold text-gray-700'>Recent free drinks</h3>
                                <ul className='mt-1 text-sm text-gray-700'>
                                    {result.redemptions.map((r, i) => (
                                        <li key={i}>
                                            {new Date(r.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                                            {r.source === 'online' ? 'used online' : 'given at the stand'}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </section>
                )}
            </div>
        </AdminShell>
    );
}
