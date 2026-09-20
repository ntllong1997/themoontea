'use client';

// Customer-facing self-order flow: scan a QR code (app/order/qr) -> build a
// cart -> pay -> get an order number and an ETA, with a text/WhatsApp follow-up
// once the order is saved. Orders land in the same `orders` table the staff
// till and the iPad app use, sharing one daily order-number sequence, so an
// online order is numbered and displayed exactly like one rung up in store.
//
// Payment methods:
//   - Card: tokenized in-browser by Square's Web Payments SDK
//     (components/SquareCardForm.jsx), then charged server-side via
//     app/api/payments/square — the card is charged BEFORE the order is
//     created, so a declined/failed charge never creates a kitchen-visible
//     order.
//   - Cash App: no charge happens here at all — the customer is shown the
//     shop's Cash App link and asked to put the order number in as the
//     payment note, and the order is created immediately (payment_status
//     'pending') so staff see it right away, same as walking up and paying
//     cash. Reconciliation is manual, same as any Cash App payment today.
//   - Cash: order created immediately (payment_status 'pending'); customer
//     pays at the register on pickup.
//
// This page does NOT print — contrast /order, the staff till, which prints
// locally at checkout.

import { Suspense, useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Banknote, CreditCard, DollarSign } from 'lucide-react';
import { createOrder, getRecentOrderCount } from '@/lib/db';
import { useCart } from '@/lib/orders/useCart';
import { estimateReadyAt } from '@/lib/orders/estimate';
import { PAYMENT_METHODS } from '@/lib/orders/paymentMethods';
import { CASHAPP_URL } from '@/lib/constants';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import OrderPanel from '@/components/OrderPanel';
import SquareCardForm from '@/components/SquareCardForm';

const PHONE_DIGITS = 10;
const PAYMENT_ICONS = { Cash: Banknote, Card: CreditCard, CashApp: DollarSign };

const countDigits = (value) => value.replace(/\D/g, '').length;

const formatEta = (minutes, readyAt) => {
    const clock = readyAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `about ${minutes} minute${minutes === 1 ? '' : 's'} (around ${clock})`;
};

async function notifyCustomer({ phone, orderNumber, etaMinutes }) {
    try {
        await fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, orderNumber, etaMinutes }),
        });
    } catch (err) {
        // Best-effort: the order is already placed and saved, a missed text
        // shouldn't read to the customer as a failed order.
        console.error('[notify] failed to send:', err);
    }
}

function OnlineOrderForm() {
    const searchParams = useSearchParams();
    const locationId = Number(searchParams.get('location')) || 1;

    const { cart, changeQuantity, clearCart, totals, orderPanelProps } = useCart();
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [notes, setNotes] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [isSending, setIsSending] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [placedOrder, setPlacedOrder] = useState(null);
    const [etaInfo, setEtaInfo] = useState(null);

    const phoneIsValid = countDigits(phone) === PHONE_DIGITS;
    const canProceed = cart.length > 0 && name.trim() !== '' && phoneIsValid;

    // Shared by every payment method once it's ready to actually save the
    // order — computing the ETA here (not earlier) means it reflects the
    // queue depth at the moment of checkout, not whenever the cart was built.
    const finalizeOrder = useCallback(async (method, paymentStatus) => {
        const recentOrderCount = await getRecentOrderCount(locationId);
        const { minutes, readyAt } = estimateReadyAt(cart, recentOrderCount);
        const created = await createOrder({
            cartItems: cart,
            phone,
            paymentMethod: method,
            paymentStatus,
            estimatedReadyAt: readyAt,
            locationId,
        });

        setEtaInfo({ minutes, readyAt });
        setPlacedOrder(created);
        clearCart();
        setNotes('');
        notifyCustomer({ phone, orderNumber: created.orderNumber, etaMinutes: minutes });
        return created;
    }, [cart, phone, locationId, clearCart]);

    const handleCardCharge = useCallback(async (token) => {
        const amountCents = Math.round(totals.total * 100);
        const idempotencyKey = crypto.randomUUID();

        const response = await fetch('/api/payments/square', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceId: token, amountCents, idempotencyKey }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Payment failed.');

        try {
            await finalizeOrder('Card', 'paid');
        } catch (err) {
            console.error('Order save failed after a successful charge:', err);
            throw new Error(
                'Your card was charged, but we could not save the order automatically. Please show this screen to staff at the register.'
            );
        }
    }, [finalizeOrder, totals.total]);

    const handlePlaceUnpaidOrder = useCallback(async () => {
        if (!canProceed) return;
        setIsSending(true);
        setSubmitError('');
        try {
            await finalizeOrder(paymentMethod, 'pending');
        } catch (err) {
            console.error('Online order failed:', err);
            setSubmitError("We couldn't place your order. Please try again.");
        } finally {
            setIsSending(false);
        }
    }, [canProceed, finalizeOrder, paymentMethod]);

    if (placedOrder) {
        const { minutes, readyAt } = etaInfo ?? { minutes: 0, readyAt: new Date() };
        return (
            <div className='min-h-screen bg-gray-50 p-4'>
                <Card className='max-w-md mx-auto mt-10'>
                    <CardContent>
                        <h1 className='text-xl font-bold mb-2'>Order received 🎉</h1>
                        <p className='text-sm text-gray-600 mb-1'>
                            Your order number is{' '}
                            <span className='font-bold'>{placedOrder.orderNumber}</span>.
                        </p>
                        <p className='text-sm text-gray-600 mb-4'>
                            Ready in {formatEta(minutes, readyAt)}. We&apos;ll text you when it&apos;s
                            ready for pickup.
                        </p>
                        <p className='text-sm text-gray-600 mb-4'>
                            Total: <span className='font-semibold'>${placedOrder.total.toFixed(2)}</span>
                        </p>

                        {placedOrder.paymentMethod === 'Card' && (
                            <p className='text-sm font-semibold text-green-700 bg-green-50 rounded px-3 py-2 mb-4'>
                                Paid ✓
                            </p>
                        )}
                        {placedOrder.paymentMethod === 'Cash' && (
                            <p className='text-sm text-amber-800 bg-amber-50 rounded px-3 py-2 mb-4'>
                                Please pay ${placedOrder.total.toFixed(2)} at the register when you
                                pick up your order.
                            </p>
                        )}
                        {placedOrder.paymentMethod === 'CashApp' && (
                            <div className='text-sm text-amber-800 bg-amber-50 rounded px-3 py-2 mb-4 space-y-2'>
                                <p>
                                    Pay ${placedOrder.total.toFixed(2)} via Cash App, and put{' '}
                                    <span className='font-bold'>Order #{placedOrder.orderNumber}</span>{' '}
                                    in the payment note so we can match it.
                                </p>
                                <a
                                    href={CASHAPP_URL}
                                    target='_blank'
                                    rel='noreferrer'
                                    className='inline-block rounded bg-green-600 text-white font-semibold px-3 py-1.5 hover:bg-green-700'
                                >
                                    Open Cash App
                                </a>
                            </div>
                        )}

                        <Button className='w-full' onClick={() => { setPlacedOrder(null); setEtaInfo(null); }}>
                            Place another order
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className='min-h-screen bg-gray-50 p-4'>
            <div className='max-w-3xl mx-auto space-y-4'>
                <div className='flex items-center gap-3'>
                    <Link href='/' className='text-gray-400 hover:text-gray-600 text-sm'>
                        ← Back
                    </Link>
                    <h1 className='text-lg font-bold'>Order Online</h1>
                </div>

                <OrderPanel {...orderPanelProps} />

                <Card>
                    <CardContent>
                        <h2 className='text-xl font-bold mb-4'>Your Order</h2>

                        {cart.length === 0 ? (
                            <p className='text-gray-400 text-sm py-6 text-center'>
                                Nothing added yet.
                            </p>
                        ) : (
                            <div className='space-y-2 mb-4'>
                                {cart.map((item, index) => (
                                    <div
                                        key={`${item.name}-${item.modifiers.join(',')}`}
                                        className='flex items-center justify-between text-sm border-b pb-2'
                                    >
                                        <span>
                                            {item.modifiers.length > 0
                                                ? `${item.name} (${item.modifiers.join(', ')})`
                                                : item.name}
                                        </span>
                                        <span className='flex items-center gap-3'>
                                            <span className='text-gray-600'>
                                                ${(item.price * item.quantity).toFixed(2)}
                                            </span>
                                            <span className='flex items-center gap-2'>
                                                <button
                                                    onClick={() => changeQuantity(index, -1)}
                                                    className='w-6 h-6 rounded border text-gray-600 hover:bg-gray-100'
                                                    aria-label={`Remove one ${item.name}`}
                                                >
                                                    −
                                                </button>
                                                <span className='w-4 text-center'>{item.quantity}</span>
                                                <button
                                                    onClick={() => changeQuantity(index, 1)}
                                                    className='w-6 h-6 rounded border text-gray-600 hover:bg-gray-100'
                                                    aria-label={`Add one ${item.name}`}
                                                >
                                                    +
                                                </button>
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className='space-y-3'>
                            <div>
                                <label
                                    htmlFor='customer-name'
                                    className='block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1'
                                >
                                    Name
                                </label>
                                <input
                                    id='customer-name'
                                    type='text'
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder='Your name'
                                    className='w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500'
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor='customer-phone'
                                    className='block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1'
                                >
                                    Phone <span className='normal-case text-gray-400'>(for your ready text)</span>
                                </label>
                                <input
                                    id='customer-phone'
                                    type='tel'
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder='(555) 000-0000'
                                    className='w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500'
                                />
                                {phone !== '' && !phoneIsValid && (
                                    <p className='text-xs text-red-600 mt-1'>
                                        Please enter a {PHONE_DIGITS}-digit phone number.
                                    </p>
                                )}
                            </div>

                            <div>
                                <label
                                    htmlFor='customer-notes'
                                    className='block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1'
                                >
                                    Notes <span className='normal-case text-gray-400'>(optional)</span>
                                </label>
                                <textarea
                                    id='customer-notes'
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={2}
                                    placeholder='Less ice, extra sweet…'
                                    className='w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500'
                                />
                            </div>
                        </div>

                        <div className='mt-4 pt-3 border-t space-y-1 text-sm'>
                            <div className='flex justify-between text-gray-600'>
                                <span>Subtotal</span>
                                <span>${totals.subtotal.toFixed(2)}</span>
                            </div>
                            <div className='flex justify-between text-gray-600'>
                                <span>Tax</span>
                                <span>${totals.tax.toFixed(2)}</span>
                            </div>
                            <div className='flex justify-between font-bold text-base'>
                                <span>Total</span>
                                <span>${totals.total.toFixed(2)}</span>
                            </div>
                        </div>

                        <div className='mt-4'>
                            <label className='block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1'>
                                Payment
                            </label>
                            <div className='flex gap-2'>
                                {PAYMENT_METHODS.map(({ key, label }) => {
                                    const Icon = PAYMENT_ICONS[key];
                                    const isActive = paymentMethod === key;
                                    return (
                                        <button
                                            key={key}
                                            type='button'
                                            onClick={() => setPaymentMethod(key)}
                                            aria-pressed={isActive}
                                            className={`flex-1 flex items-center justify-center gap-1.5 rounded border px-2 py-2 text-xs font-medium transition-colors ${
                                                isActive
                                                    ? 'bg-black text-white border-black'
                                                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                            }`}
                                        >
                                            <Icon size={14} />
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {submitError && (
                            <p className='text-sm text-red-600 mt-3'>{submitError}</p>
                        )}

                        {!canProceed && (
                            <p className='text-xs text-gray-400 mt-3 text-center'>
                                Add an item, then enter your name and phone to continue.
                            </p>
                        )}

                        {canProceed && paymentMethod === 'Card' && (
                            <div className='mt-4'>
                                <SquareCardForm
                                    amountLabel={`$${totals.total.toFixed(2)}`}
                                    onCharge={handleCardCharge}
                                />
                            </div>
                        )}

                        {canProceed && paymentMethod === 'CashApp' && (
                            <div className='mt-4'>
                                <p className='text-xs text-gray-500 mb-2'>
                                    You&apos;ll pay via Cash App after placing your order — we&apos;ll
                                    show you the link and your order number to use as the note.
                                </p>
                                <Button
                                    className='w-full'
                                    onClick={handlePlaceUnpaidOrder}
                                    disabled={isSending}
                                >
                                    {isSending ? 'Placing order…' : `Place Order — $${totals.total.toFixed(2)}`}
                                </Button>
                            </div>
                        )}

                        {canProceed && paymentMethod === 'Cash' && (
                            <div className='mt-4'>
                                <p className='text-xs text-gray-500 mb-2'>
                                    You&apos;ll pay at the register when you pick up your order.
                                </p>
                                <Button
                                    className='w-full'
                                    onClick={handlePlaceUnpaidOrder}
                                    disabled={isSending}
                                >
                                    {isSending ? 'Placing order…' : `Place Order — $${totals.total.toFixed(2)}`}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default function OnlineOrderPage() {
    return (
        <Suspense fallback={null}>
            <OnlineOrderForm />
        </Suspense>
    );
}
