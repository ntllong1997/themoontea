'use client';

// Customers order ahead at a pop-up and pay by card (Square).
//
// The page only PREVIEWS prices; the server recomputes everything from the
// till's catalog, re-checks that ordering is open and that the customer is
// within a mile of the pop-up, then charges the card. Card details go straight
// from Square's secure form to Square; this site only ever sees a token.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { MapPin, Minus, Plus, Trash2 } from 'lucide-react';
import { buildCartLine, categoryFor } from '@/lib/menu/catalog';
import { formatTime, parseDate } from '@/lib/site/popups';
import { LOYALTY_PUBLIC, normalizePhone } from '@/lib/online/loyalty';
import PunchCard from '@/components/site/PunchCard';
import SimpleHeader from '@/components/site/SimpleHeader';

const money = (n) => `$${n.toFixed(2)}`;
const toppingLabel = (t) => (t === 'Nothing' ? 'No boba' : t);
const lastOrderTime = (end) => {
    const [h, m] = end.split(':').map(Number);
    const total = h * 60 + m - 15;
    return formatTime(`${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`);
};

/** A cart line's label and unit price, from the catalog (server re-checks). */
function preview(line) {
    const cartLine = buildCartLine(categoryFor(line.category), line.selection);
    if (!cartLine) return null;
    const label = cartLine.modifiers.length ? `${cartLine.name} (${cartLine.modifiers.join(', ')})` : cartLine.name;
    return { label, price: cartLine.price, type: cartLine.type };
}

const sameSelection = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function useSquareCard(square, enabled) {
    const [state, setState] = useState({ card: null, error: '' });
    const started = useRef(false);

    useEffect(() => {
        if (!square || !enabled || started.current) return;
        started.current = true;
        let cancelled = false;
        (async () => {
            try {
                if (!window.Square) {
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = square.sdkUrl;
                        script.onload = resolve;
                        script.onerror = () => reject(new Error('Could not load the secure card form.'));
                        document.head.appendChild(script);
                    });
                }
                const payments = window.Square.payments(square.applicationId, square.locationId);
                const card = await payments.card();
                await card.attach('#square-card');
                if (!cancelled) setState({ card, error: '' });
            } catch (error) {
                if (!cancelled) setState({ card: null, error: error.message || 'Could not load the secure card form.' });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [square, enabled]);

    return state;
}

export default function OnlineOrderPage() {
    const [status, setStatus] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [where, setWhere] = useState({ state: 'idle' });
    const [cart, setCart] = useState([]);
    const [dog, setDog] = useState({ inside: '', outside: '', addOns: { dust: false } });
    const [openDrink, setOpenDrink] = useState(null);
    const [drinkChoice, setDrinkChoice] = useState({ boba: '', addOns: { customization: false } });
    const [details, setDetails] = useState({ name: '', phone: '', note: '' });
    const [loyalty, setLoyalty] = useState(null);
    const [useReward, setUseReward] = useState(false);
    const [paying, setPaying] = useState(false);
    const [payError, setPayError] = useState('');
    const [placed, setPlaced] = useState(null);
    const [added, setAdded] = useState('');
    const confirmationHeading = useRef(null);

    useEffect(() => {
        fetch('/api/order/status', { cache: 'no-store' })
            .then((r) => r.json().then((b) => (r.ok ? b : Promise.reject(new Error(b.error)))))
            .then(setStatus)
            .catch((e) => setLoadError(e.message || 'Online ordering is unavailable right now.'));
    }, []);

    const open = status?.ordering.open === true;
    const { card: squareCard, error: squareError } = useSquareCard(status?.square, open);

    const [corndogMenu, bobaMenu] = status?.menu ?? [];

    // ── location ────────────────────────────────────────────────────────
    const checkLocation = useCallback(() => {
        if (!('geolocation' in navigator)) {
            setWhere({ state: 'error', message: 'This browser cannot share its location.' });
            return;
        }
        setWhere({ state: 'checking' });
        navigator.geolocation.getCurrentPosition(
            async ({ coords }) => {
                const reading = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
                try {
                    const response = await fetch('/api/order/nearby', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(reading),
                    });
                    const body = await response.json();
                    if (!response.ok) throw new Error(body.error);
                    setWhere(body.nearby ? { state: 'nearby', coords: reading } : { state: 'far', distance: body.distance });
                } catch (e) {
                    setWhere({ state: 'error', message: e.message || 'Please try again.' });
                }
            },
            (error) =>
                setWhere(
                    error.code === error.PERMISSION_DENIED
                        ? { state: 'denied' }
                        : { state: 'error', message: 'We could not find your location. Please try again.' }
                ),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
        );
    }, []);

    // ── cart ────────────────────────────────────────────────────────────
    const addToCart = useCallback((category, selection) => {
        setCart((lines) => {
            const i = lines.findIndex((l) => l.category === category && sameSelection(l.selection, selection));
            if (i >= 0) return lines.map((l, j) => (j === i ? { ...l, quantity: Math.min(10, l.quantity + 1) } : l));
            return [...lines, { id: crypto.randomUUID(), category, selection, quantity: 1 }];
        });
        setAdded(`${preview({ category, selection })?.label} added to your order.`);
    }, []);

    const changeQuantity = (id, delta) =>
        setCart((lines) =>
            lines
                .map((l) => (l.id === id ? { ...l, quantity: Math.min(10, l.quantity + delta) } : l))
                .filter((l) => l.quantity > 0)
        );

    const priced = useMemo(() => cart.map((l) => ({ ...l, ...preview(l) })), [cart]);
    const totals = useMemo(() => {
        let subtotal = priced.reduce((sum, l) => sum + l.price * l.quantity, 0);
        let freeDrink = 0;
        if (useReward) {
            const drinks = priced.filter((l) => l.type === 'Boba');
            if (drinks.length) freeDrink = Math.min(...drinks.map((l) => l.price));
        }
        subtotal -= freeDrink;
        const tax = Math.round(subtotal * (status?.taxRate ?? 0) * 100) / 100;
        return { subtotal, tax, total: subtotal + tax, freeDrink };
    }, [priced, useReward, status]);

    // ── loyalty, as soon as a full phone number is typed ────────────────
    const phoneDigits = normalizePhone(details.phone);
    useEffect(() => {
        setLoyalty(null);
        setUseReward(false);
        if (!LOYALTY_PUBLIC || !phoneDigits) return;
        const controller = new AbortController();
        fetch('/api/loyalty', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phoneDigits }),
            signal: controller.signal,
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((b) => b && setLoyalty(b.card))
            .catch(() => {});
        return () => controller.abort();
    }, [phoneDigits]);

    // ── pay ─────────────────────────────────────────────────────────────
    async function pay(event) {
        event.preventDefault();
        setPayError('');
        if (!details.name.trim()) return setPayError('Please enter your name for the order.');
        if (!phoneDigits) return setPayError('Please enter a 10-digit phone number.');
        if (where.state !== 'nearby') return setPayError('Please check your location first (step 1).');
        if (!squareCard) return setPayError('The card form is still loading. Please wait a moment.');
        setPaying(true);
        try {
            const tokenResult = await squareCard.tokenize();
            if (tokenResult.status !== 'OK') {
                throw new Error(tokenResult.errors?.[0]?.message ?? 'Please check your card details.');
            }
            const response = await fetch('/api/order/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lines: cart.map(({ category, selection, quantity }) => ({ category, selection, quantity })),
                    name: details.name,
                    phone: details.phone,
                    note: details.note,
                    useReward,
                    coords: where.coords,
                    sourceId: tokenResult.token,
                    idempotencyKey: crypto.randomUUID(),
                }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error ?? 'The payment did not go through. Please try again.');
            setPlaced(body);
            setCart([]);
        } catch (e) {
            setPayError(e.message);
        }
        setPaying(false);
    }

    useEffect(() => {
        if (placed) {
            window.scrollTo({ top: 0 });
            confirmationHeading.current?.focus();
        }
    }, [placed]);

    const header = (
        <SimpleHeader links={[{ href: '/menu', label: 'Menu' }, ...(LOYALTY_PUBLIC ? [{ href: '/loyalty', label: 'Rewards' }] : [])]} />
    );

    // ── screens ─────────────────────────────────────────────────────────
    if (placed) {
        return (
            <>
                {header}
                <div className='mx-auto max-w-md space-y-5 px-4 py-8'>
                    <h1 ref={confirmationHeading} tabIndex={-1} className='leading-none outline-none'>
                        <span className='block font-script text-2xl text-moon-orange'>Thank you!</span>
                        <span className='font-display text-4xl'>Order #{placed.orderNumber}</span>
                    </h1>
                    <p className='text-lg'>
                        We&apos;re making it now. Come to the stand and give your name and order number.
                    </p>
                    <p className='text-moon-muted'>
                        Paid {money(placed.total)}
                        {placed.rewardApplied && ' · free drink used 🎉'}
                        {placed.receiptUrl && (
                            <>
                                {' · '}
                                <a href={placed.receiptUrl} target='_blank' rel='noopener noreferrer' className='font-bold text-moon-orange underline'>
                                    Card receipt<span className='sr-only'> (opens in a new tab)</span>
                                </a>
                            </>
                        )}
                    </p>
                    {LOYALTY_PUBLIC && placed.card && <PunchCard card={placed.card} />}
                    <button
                        type='button'
                        onClick={() => setPlaced(null)}
                        className='w-full rounded-full bg-moon-ink py-3 font-bold text-white hover:bg-moon-orange'
                    >
                        Order something else
                    </button>
                </div>
            </>
        );
    }

    if (loadError || (status && !open)) {
        const { reason, next, popup } = status?.ordering ?? {};
        return (
            <>
                {header}
                <div className='mx-auto max-w-md px-4 py-10 text-center'>
                    <p className='text-5xl' aria-hidden>🌙</p>
                    <h1 className='mt-3 font-display text-3xl'>
                        {reason === 'no_location' ? 'Order at the stand today' : 'Online ordering is closed'}
                    </h1>
                    <p className='mt-3 text-moon-muted'>
                        {loadError ||
                            (reason === 'payments_not_set_up'
                                ? 'Online ordering is coming soon.'
                                : reason === 'no_location'
                                  ? `We're at ${popup?.place} today, but online ordering isn't set up for this spot. Come say hi at the stand!`
                                  : 'You can order ahead while we are at a pop-up.')}
                    </p>
                    {next && (
                        <p className='mt-4 rounded-2xl bg-white p-4 text-moon-ink ring-1 ring-moon-caramel/30'>
                            Next pop-up: <strong>{parseDate(next.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</strong>,{' '}
                            {formatTime(next.start)}–{formatTime(next.end)} at <strong>{next.place}</strong>
                        </p>
                    )}
                    <div className='mt-6 flex flex-col gap-2'>
                        <Link href='/menu#popups' className='rounded-full bg-moon-ink py-3 font-bold text-white hover:bg-moon-orange'>
                            See the pop-up calendar
                        </Link>
                        {LOYALTY_PUBLIC && (
                            <Link href='/loyalty' className='rounded-full bg-white py-3 font-bold ring-1 ring-moon-caramel/40 hover:bg-moon-paper'>
                                Check my rewards
                            </Link>
                        )}
                    </div>
                </div>
            </>
        );
    }

    if (!status) {
        return (
            <>
                {header}
                <p role='status' className='py-20 text-center text-moon-muted'>
                    Loading the menu…
                </p>
            </>
        );
    }

    const { popup } = status.ordering;
    const dogLine = dog.inside && dog.outside ? preview({ category: 'Corndog', selection: dog }) : null;
    const dustAvailable = dog.outside === 'Potato';

    return (
        <>
            {header}
            <div className='mx-auto max-w-3xl px-4 pb-16 pt-6'>
                <h1 className='leading-none'>
                    <span className='block font-script text-2xl text-moon-orange'>Order ahead</span>
                    <span className='font-display text-4xl'>{popup.name}</span>
                </h1>
                <p className='mt-2 text-moon-muted'>
                    {popup.place} · last online orders at {lastOrderTime(popup.end)}. Pay now, pick up at the stand.
                </p>
                <p className='sr-only' aria-live='polite'>
                    {added}
                </p>

                {/* 1 ── where are you */}
                <section aria-labelledby='step-where' className='mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-moon-caramel/30'>
                    <h2 id='step-where' className='font-display text-2xl'>
                        1. Are you at the pop-up?
                    </h2>
                    <p className='mt-1 text-sm text-moon-muted'>
                        Online orders are for customers at the pop-up, within 1 mile. We check once and don&apos;t store your location.
                    </p>
                    <div className='mt-3' aria-live='polite'>
                        {where.state === 'nearby' ? (
                            <p className='flex items-center gap-2 font-bold text-green-800'>
                                <MapPin className='h-5 w-5' aria-hidden /> You&apos;re at the pop-up. You can order!
                            </p>
                        ) : (
                            <>
                                <button
                                    type='button'
                                    onClick={checkLocation}
                                    disabled={where.state === 'checking'}
                                    className='inline-flex items-center gap-2 rounded-full bg-moon-ink px-5 py-3 font-bold text-white hover:bg-moon-orange disabled:opacity-50'
                                >
                                    <MapPin className='h-5 w-5' aria-hidden />
                                    {where.state === 'checking' ? 'Checking…' : 'Check my location'}
                                </button>
                                {where.state === 'far' && (
                                    <p role='alert' className='mt-3 text-sm text-red-800'>
                                        You look about {(where.distance / 1609.34).toFixed(1)} miles away. Online orders open when you&apos;re within 1 mile of {popup.place}.
                                    </p>
                                )}
                                {where.state === 'denied' && (
                                    <p role='alert' className='mt-3 text-sm text-red-800'>
                                        Location is turned off for this site. Allow it in your browser settings and try again, or order at the stand.
                                    </p>
                                )}
                                {where.state === 'error' && (
                                    <p role='alert' className='mt-3 text-sm text-red-800'>
                                        {where.message}
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                </section>

                {/* 2 ── choose */}
                <section aria-labelledby='step-choose' className='mt-6'>
                    <h2 id='step-choose' className='font-display text-2xl'>
                        2. Choose your food & drinks
                    </h2>

                    {corndogMenu?.available && (
                        <div className='mt-4 rounded-3xl bg-moon-caramel p-4 text-moon-ink sm:p-5'>
                            <div className='flex items-center gap-3'>
                                {corndogMenu.image && (
                                    <Image src={corndogMenu.image} alt='' width={96} height={77} className='h-16 w-auto' />
                                )}
                                <h3 className='font-display text-2xl'>Korean Corndog · {money(corndogMenu.price)}</h3>
                            </div>
                            {corndogMenu.groups.map((group) => (
                                <fieldset key={group.key} className='mt-4'>
                                    <legend className='mb-2 font-bold'>Choose {group.label.toLowerCase()}</legend>
                                    <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
                                        {group.options.map((option) => (
                                            <label
                                                key={option}
                                                className={`cursor-pointer rounded-2xl bg-white px-3 py-3 text-center font-bold shadow-[0_3px_0_#241810] has-[:checked]:bg-moon-ink has-[:checked]:text-white has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-blue-600`}
                                            >
                                                <input
                                                    type='radio'
                                                    name={`dog-${group.key}`}
                                                    value={option}
                                                    checked={dog[group.key] === option}
                                                    onChange={() =>
                                                        setDog((d) => ({
                                                            ...d,
                                                            [group.key]: option,
                                                            addOns: group.key === 'outside' && option !== 'Potato' ? { dust: false } : d.addOns,
                                                        }))
                                                    }
                                                    className='sr-only'
                                                />
                                                {option}
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                            ))}
                            {dustAvailable && (
                                <label className='mt-3 flex items-center gap-2 font-bold'>
                                    <input
                                        type='checkbox'
                                        checked={dog.addOns.dust}
                                        onChange={(e) => setDog((d) => ({ ...d, addOns: { dust: e.target.checked } }))}
                                        className='h-5 w-5'
                                    />
                                    Add Hot Cheeto dust (+$1)
                                </label>
                            )}
                            <button
                                type='button'
                                disabled={!dogLine}
                                onClick={() => {
                                    addToCart('Corndog', dog);
                                    setDog({ inside: '', outside: '', addOns: { dust: false } });
                                }}
                                className='mt-4 w-full rounded-full bg-moon-ink py-3 font-bold text-white hover:bg-moon-orange disabled:opacity-40'
                            >
                                {dogLine ? `Add corndog · ${money(dogLine.price)}` : 'Pick inside and outside'}
                            </button>
                        </div>
                    )}

                    <h3 className='mt-6 font-display text-2xl'>Boba · {money(bobaMenu?.price ?? 0)}</h3>
                    <ul className='mt-3 grid gap-3 sm:grid-cols-2'>
                        {bobaMenu?.drinks.map((drink) => {
                            const isOpen = openDrink === drink.option;
                            return (
                                <li key={drink.option} className={`overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-moon-caramel/30 ${drink.available ? '' : 'opacity-60'}`}>
                                    <div className='flex gap-3 p-3'>
                                        <div className='relative h-24 w-20 shrink-0 rounded-2xl bg-moon-paper'>
                                            {drink.image && (
                                                <Image src={drink.image} alt='' fill sizes='80px' className={`object-contain p-1 mix-blend-multiply ${drink.available ? '' : 'grayscale'}`} />
                                            )}
                                        </div>
                                        <div className='min-w-0 flex-1'>
                                            <p className='font-extrabold leading-tight'>{drink.name}</p>
                                            {drink.available ? (
                                                <button
                                                    type='button'
                                                    aria-expanded={isOpen}
                                                    onClick={() => {
                                                        setOpenDrink(isOpen ? null : drink.option);
                                                        setDrinkChoice({ boba: '', addOns: { customization: false } });
                                                    }}
                                                    className='mt-2 rounded-full bg-moon-cream px-4 py-2 text-sm font-bold ring-1 ring-moon-caramel/50 hover:bg-moon-paper'
                                                >
                                                    {isOpen ? 'Close' : 'Choose'}
                                                    <span className='sr-only'> {drink.name}</span>
                                                </button>
                                            ) : (
                                                <p className='mt-2 inline-block rounded-full bg-moon-ink px-2.5 py-0.5 text-xs font-bold uppercase text-white'>
                                                    Sold out
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    {isOpen && (
                                        <div className='border-t border-moon-caramel/20 bg-moon-paper/60 p-3'>
                                            <fieldset>
                                                <legend className='mb-2 text-sm font-bold'>Choose your boba</legend>
                                                <div className='grid grid-cols-2 gap-2'>
                                                    {bobaMenu.toppings.map((topping) => (
                                                        <label
                                                            key={topping}
                                                            className='cursor-pointer rounded-xl bg-white px-2 py-2 text-center text-sm font-bold ring-1 ring-moon-caramel/40 has-[:checked]:bg-moon-ink has-[:checked]:text-white has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-blue-600'
                                                        >
                                                            <input
                                                                type='radio'
                                                                name={`boba-${drink.option}`}
                                                                value={topping}
                                                                checked={drinkChoice.boba === topping}
                                                                onChange={() => setDrinkChoice((c) => ({ ...c, boba: topping }))}
                                                                className='sr-only'
                                                            />
                                                            {toppingLabel(topping)}
                                                        </label>
                                                    ))}
                                                </div>
                                            </fieldset>
                                            {drink.customization && (
                                                <label className='mt-3 flex items-center gap-2 text-sm font-bold'>
                                                    <input
                                                        type='checkbox'
                                                        checked={drinkChoice.addOns.customization}
                                                        onChange={(e) => setDrinkChoice((c) => ({ ...c, addOns: { customization: e.target.checked } }))}
                                                        className='h-5 w-5'
                                                    />
                                                    {drink.customization}
                                                </label>
                                            )}
                                            <button
                                                type='button'
                                                disabled={!drinkChoice.boba}
                                                onClick={() => {
                                                    addToCart('Boba', { drink: drink.option, boba: drinkChoice.boba, addOns: drinkChoice.addOns });
                                                    setOpenDrink(null);
                                                }}
                                                className='mt-3 w-full rounded-full bg-moon-ink py-2.5 font-bold text-white hover:bg-moon-orange disabled:opacity-40'
                                            >
                                                {drinkChoice.boba ? `Add ${drink.name}` : 'Pick a boba option'}
                                            </button>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </section>

                {/* 3 ── details & pay */}
                <form onSubmit={pay} aria-labelledby='step-pay' className='mt-8 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-moon-caramel/30'>
                    <h2 id='step-pay' className='font-display text-2xl'>
                        3. Your order
                    </h2>

                    {priced.length === 0 ? (
                        <p className='mt-3 text-moon-muted'>Nothing added yet.</p>
                    ) : (
                        <ul className='mt-3 divide-y divide-moon-caramel/20'>
                            {priced.map((line) => (
                                <li key={line.id} className='flex items-center gap-3 py-2'>
                                    <span className='min-w-0 flex-1 font-semibold'>{line.label}</span>
                                    <span className='flex items-center gap-1'>
                                        <button type='button' onClick={() => changeQuantity(line.id, -1)} aria-label={`One less ${line.label}`} className='rounded-full p-2 ring-1 ring-moon-caramel/40 hover:bg-moon-paper'>
                                            {line.quantity === 1 ? <Trash2 className='h-4 w-4' aria-hidden /> : <Minus className='h-4 w-4' aria-hidden />}
                                        </button>
                                        <span className='w-6 text-center font-bold' aria-label={`Quantity ${line.quantity}`}>
                                            {line.quantity}
                                        </span>
                                        <button type='button' onClick={() => changeQuantity(line.id, 1)} aria-label={`One more ${line.label}`} className='rounded-full p-2 ring-1 ring-moon-caramel/40 hover:bg-moon-paper'>
                                            <Plus className='h-4 w-4' aria-hidden />
                                        </button>
                                    </span>
                                    <span className='w-16 text-right'>{money(line.price * line.quantity)}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className='mt-5 grid gap-3 sm:grid-cols-2'>
                        <label className='block'>
                            <span className='mb-1 block text-sm font-bold'>Name for the order</span>
                            <input
                                value={details.name}
                                onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))}
                                autoComplete='given-name'
                                maxLength={40}
                                className='w-full rounded-2xl border border-moon-caramel/50 px-4 py-3 focus:border-moon-ink focus:outline-none focus:ring-2 focus:ring-blue-600'
                            />
                        </label>
                        <label className='block'>
                            <span className='mb-1 block text-sm font-bold'>{LOYALTY_PUBLIC ? 'Phone (for rewards)' : 'Phone'}</span>
                            <input
                                type='tel'
                                inputMode='tel'
                                autoComplete='tel'
                                value={details.phone}
                                onChange={(e) => setDetails((d) => ({ ...d, phone: e.target.value }))}
                                placeholder='(956) 555-0123'
                                className='w-full rounded-2xl border border-moon-caramel/50 px-4 py-3 focus:border-moon-ink focus:outline-none focus:ring-2 focus:ring-blue-600'
                            />
                        </label>
                    </div>
                    {loyalty && (
                        <div className='mt-3 rounded-2xl bg-moon-cream p-3 text-sm' aria-live='polite'>
                            {loyalty.rewardsAvailable > 0 ? (
                                <label className='flex items-center gap-2 font-bold'>
                                    <input
                                        type='checkbox'
                                        checked={useReward}
                                        onChange={(e) => setUseReward(e.target.checked)}
                                        disabled={!priced.some((l) => l.type === 'Boba')}
                                        className='h-5 w-5'
                                    />
                                    🎁 Use my free drink {!priced.some((l) => l.type === 'Boba') && '(add a drink first)'}
                                </label>
                            ) : (
                                <p>
                                    🧋 {loyalty.stamps} of {loyalty.perReward} stamps. This order adds more!
                                </p>
                            )}
                        </div>
                    )}
                    <label className='mt-3 block'>
                        <span className='mb-1 block text-sm font-bold'>
                            Note for the kitchen <span className='font-normal text-moon-muted'>(optional)</span>
                        </span>
                        <input
                            value={details.note}
                            onChange={(e) => setDetails((d) => ({ ...d, note: e.target.value }))}
                            maxLength={200}
                            placeholder='Less ice, extra sauce…'
                            className='w-full rounded-2xl border border-moon-caramel/50 px-4 py-3 focus:border-moon-ink focus:outline-none focus:ring-2 focus:ring-blue-600'
                        />
                    </label>

                    <dl className='mt-5 space-y-1 border-t border-moon-caramel/30 pt-3 text-sm'>
                        {totals.freeDrink > 0 && (
                            <div className='flex justify-between text-green-800'>
                                <dt>Free drink</dt>
                                <dd>−{money(totals.freeDrink)}</dd>
                            </div>
                        )}
                        <div className='flex justify-between'>
                            <dt>Subtotal</dt>
                            <dd>{money(totals.subtotal)}</dd>
                        </div>
                        <div className='flex justify-between'>
                            <dt>Tax</dt>
                            <dd>{money(totals.tax)}</dd>
                        </div>
                        <div className='flex justify-between text-lg font-extrabold'>
                            <dt>Total</dt>
                            <dd>{money(totals.total)}</dd>
                        </div>
                    </dl>

                    <fieldset className='mt-5'>
                        <legend className='mb-2 text-sm font-bold'>Card</legend>
                        <div id='square-card' className='min-h-[90px]' />
                        {squareError && (
                            <p role='alert' className='text-sm text-red-800'>
                                {squareError}
                            </p>
                        )}
                        {status.square?.environment === 'sandbox' && (
                            <p className='text-xs text-moon-muted'>Test mode: use card 4111 1111 1111 1111, any future date, any CVV and ZIP.</p>
                        )}
                    </fieldset>

                    {payError && (
                        <p role='alert' className='mt-3 rounded-2xl bg-red-50 p-3 text-sm text-red-800'>
                            {payError}
                        </p>
                    )}

                    <button
                        type='submit'
                        disabled={paying || priced.length === 0 || where.state !== 'nearby'}
                        className='mt-4 w-full rounded-full bg-moon-ink py-4 text-lg font-bold text-white hover:bg-moon-orange disabled:opacity-40'
                    >
                        {paying ? 'Paying…' : where.state !== 'nearby' ? 'Check your location to pay' : `Pay ${money(totals.total)}`}
                    </button>
                    <p className='mt-2 text-center text-xs text-moon-muted'>Payments are processed securely by Square.</p>
                </form>
            </div>
        </>
    );
}
