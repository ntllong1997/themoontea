'use client';

// Mounts Square's hosted card field (Web Payments SDK) and tokenizes on
// submit. The SDK is loaded from Square's CDN via a plain <script> tag —
// there's no npm package for the browser SDK, it's script-tag-only by design
// (Square serves it themselves so it can ship PCI-scope-reducing updates
// without an app redeploy).
//
// This never sees a card number: `card.tokenize()` resolves to a one-time
// token that the server exchanges for a charge in app/api/payments/square —
// SQUARE_ACCESS_TOKEN never reaches the browser.

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';

const SQUARE_SDK_URL = {
    production: 'https://web.squarecdn.com/v1/square.js',
    sandbox: 'https://sandbox.web.squarecdn.com/v1/square.js',
};

function loadSquareSdk(env) {
    if (window.Square) return Promise.resolve(window.Square);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = SQUARE_SDK_URL[env];
        script.onload = () => resolve(window.Square);
        script.onerror = () => reject(new Error('Could not load the card payment form.'));
        document.head.appendChild(script);
    });
}

/**
 * @param {{ amountLabel: string, onCharge: (token: string) => Promise<void>, disabled?: boolean }} props
 * `onCharge` receives the Square token and is expected to call the
 * /api/payments/square route and throw on failure — this component just
 * surfaces whatever it throws.
 */
export default function SquareCardForm({ amountLabel, onCharge, disabled = false }) {
    const containerRef = useRef(null);
    const cardRef = useRef(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState('');
    const [isPaying, setIsPaying] = useState(false);

    const appId = process.env.NEXT_PUBLIC_SQUARE_APP_ID;
    const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID;
    const env = process.env.NEXT_PUBLIC_SQUARE_ENV === 'sandbox' ? 'sandbox' : 'production';

    useEffect(() => {
        if (!appId || !locationId) {
            setError('Card payments are not set up yet — try Cash App or pay at the register.');
            return;
        }

        let cancelled = false;
        let card;

        async function init() {
            try {
                const Square = await loadSquareSdk(env);
                if (cancelled) return;
                const payments = Square.payments(appId, locationId);
                card = await payments.card();
                await card.attach(containerRef.current);
                if (cancelled) { card.destroy(); return; }
                cardRef.current = card;
                setReady(true);
            } catch (err) {
                console.error('[square] card form init failed:', err);
                if (!cancelled) setError('Could not load the card payment form.');
            }
        }

        init();
        return () => {
            cancelled = true;
            cardRef.current?.destroy?.();
            cardRef.current = null;
        };
    }, [appId, locationId, env]);

    const handlePay = async () => {
        if (!cardRef.current || isPaying) return;
        setIsPaying(true);
        setError('');
        try {
            const result = await cardRef.current.tokenize();
            if (result.status !== 'OK') {
                throw new Error(result.errors?.[0]?.message || 'Card was declined.');
            }
            await onCharge(result.token);
        } catch (err) {
            setError(err.message || 'Payment failed — please try again.');
        } finally {
            setIsPaying(false);
        }
    };

    return (
        <div>
            <div ref={containerRef} className='rounded border border-gray-300 p-3 min-h-[56px] bg-white' />
            {error && <p className='text-sm text-red-600 mt-2'>{error}</p>}
            <Button
                className='w-full mt-3'
                onClick={handlePay}
                disabled={!ready || disabled || isPaying}
            >
                {isPaying ? 'Processing…' : `Pay ${amountLabel}`}
            </Button>
        </div>
    );
}
