'use client';

// "Prove this phone is yours": text a 6-digit code, type it back. On success
// the server remembers the number on this browser for 30 days, and
// onVerified gets { phone, display, card }.
//
// With `phone` given (the order page already has the number) it skips
// straight to sending the code to that number.

import { useEffect, useId, useRef, useState } from 'react';
import { normalizePhone } from '@/lib/online/loyalty';

const RESEND_SECONDS = 30;

async function post(url, body) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? 'Please try again.');
    return data;
}

export default function PhoneVerify({ phone: fixedPhone = null, onVerified, sendLabel = 'Text me a code' }) {
    const id = useId();
    const [phone, setPhone] = useState(fixedPhone ?? '');
    const [step, setStep] = useState('phone');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [wait, setWait] = useState(0);
    const codeInput = useRef(null);

    const digits = normalizePhone(fixedPhone ?? phone);

    useEffect(() => {
        if (wait <= 0) return undefined;
        const timer = setTimeout(() => setWait((w) => w - 1), 1000);
        return () => clearTimeout(timer);
    }, [wait]);

    useEffect(() => {
        if (step === 'code') codeInput.current?.focus();
    }, [step]);

    async function send(event) {
        event?.preventDefault();
        if (!digits) return setError('Please enter a 10-digit US phone number.');
        setBusy(true);
        setError('');
        try {
            await post('/api/loyalty/code', { phone: digits });
            setStep('code');
            setCode('');
            setWait(RESEND_SECONDS);
        } catch (e) {
            setError(e.message);
        }
        setBusy(false);
    }

    async function verify(event) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            onVerified(await post('/api/loyalty/verify', { phone: digits, code }));
        } catch (e) {
            setError(e.message);
        }
        setBusy(false);
    }

    // A <div>, not a <form>: the order page puts this inside its own form.
    const onEnter = (action) => (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            action(e);
        }
    };

    return (
        <div className='space-y-3'>
            {step === 'phone' ? (
                <>
                    {!fixedPhone && (
                        <>
                            <label htmlFor={`${id}-phone`} className='block text-sm font-bold'>
                                Phone number
                            </label>
                            <input
                                id={`${id}-phone`}
                                type='tel'
                                inputMode='tel'
                                autoComplete='tel'
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                onKeyDown={onEnter(send)}
                                placeholder='(956) 555-0123'
                                className='w-full rounded-2xl border border-moon-caramel/50 bg-white px-4 py-3 text-lg focus:border-moon-ink focus:outline-none focus:ring-2 focus:ring-blue-600'
                            />
                        </>
                    )}
                    <button
                        type='button'
                        onClick={send}
                        disabled={busy || !digits}
                        className='w-full rounded-full bg-moon-ink py-3 font-bold text-white transition hover:bg-moon-orange disabled:opacity-40'
                    >
                        {busy ? 'Sending…' : sendLabel}
                    </button>
                    <p className='text-xs text-moon-muted'>We text a 6-digit code to prove the number is yours. Message and data rates may apply.</p>
                </>
            ) : (
                <>
                    <label htmlFor={`${id}-code`} className='block text-sm font-bold'>
                        Code we texted to {digits && `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`}
                    </label>
                    <input
                        id={`${id}-code`}
                        ref={codeInput}
                        type='text'
                        inputMode='numeric'
                        autoComplete='one-time-code'
                        pattern='[0-9]*'
                        maxLength={10}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={onEnter(verify)}
                        className='w-full rounded-2xl border border-moon-caramel/50 bg-white px-4 py-3 text-center text-2xl tracking-[0.4em] focus:border-moon-ink focus:outline-none focus:ring-2 focus:ring-blue-600'
                    />
                    <button
                        type='button'
                        onClick={verify}
                        disabled={busy || code.length < 4}
                        className='w-full rounded-full bg-moon-ink py-3 font-bold text-white transition hover:bg-moon-orange disabled:opacity-40'
                    >
                        {busy ? 'Checking…' : 'Verify'}
                    </button>
                    <div className='flex flex-wrap justify-between gap-2 text-sm'>
                        <button type='button' onClick={send} disabled={busy || wait > 0} className='font-bold text-moon-orange underline disabled:text-moon-muted disabled:no-underline'>
                            {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
                        </button>
                        {!fixedPhone && (
                            <button
                                type='button'
                                onClick={() => {
                                    setStep('phone');
                                    setError('');
                                }}
                                className='font-bold text-moon-orange underline'
                            >
                                Use a different number
                            </button>
                        )}
                    </div>
                </>
            )}
            {error && (
                <p role='alert' className='rounded-2xl bg-red-50 p-3 text-sm text-red-800'>
                    {error}
                </p>
            )}
        </div>
    );
}
