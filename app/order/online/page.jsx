'use client';

// Customer-facing online ordering.
//
// Orders land in the same `orders` table the staff till and the iPad app use,
// sharing one daily order-number sequence, so an online order is numbered and
// displayed exactly like one rung up in store. This page does NOT print —
// contrast /order, the staff till, which prints locally at checkout.
//
// The table has no source/print_status columns, so an online order is not
// distinguishable from an in-store one once saved, and there is no auto-print
// queue for staff to claim: online orders appear in history and must be
// printed manually from there.

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { createOrder } from '@/lib/db';
import { useCart } from '@/lib/orders/useCart';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import OrderPanel from '@/components/OrderPanel';

const PHONE_DIGITS = 10;

const countDigits = (value) => value.replace(/\D/g, '').length;

export default function OnlineOrderPage() {
    const { cart, changeQuantity, clearCart, totals, orderPanelProps } = useCart();
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [notes, setNotes] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [placedOrder, setPlacedOrder] = useState(null);

    const phoneIsValid = countDigits(phone) === PHONE_DIGITS;
    const canSubmit = cart.length > 0 && name.trim() !== '' && phoneIsValid && !isSending;

    const handleSubmit = useCallback(async () => {
        if (!canSubmit) return;
        setIsSending(true);
        setSubmitError('');
        try {
            const created = await createOrder({
                cartItems: cart,
                phone,
                paymentMethod: 'online',
            });
            setPlacedOrder(created);
            clearCart();
            setName('');
            setPhone('');
            setNotes('');
        } catch (err) {
            console.error('Online order failed:', err);
            setSubmitError("We couldn't place your order. Please try again.");
        } finally {
            setIsSending(false);
        }
    }, [canSubmit, cart, name, phone, notes, clearCart]);

    if (placedOrder) {
        return (
            <div className='min-h-screen bg-gray-50 p-4'>
                <Card className='max-w-md mx-auto mt-10'>
                    <CardContent>
                        <h1 className='text-xl font-bold mb-2'>Order received 🎉</h1>
                        <p className='text-sm text-gray-600 mb-4'>
                            Your order number is{' '}
                            <span className='font-bold'>{placedOrder.orderNumber}</span>. We&apos;re
                            making it now — we&apos;ll text you when it&apos;s ready for pickup.
                        </p>
                        <p className='text-sm text-gray-600 mb-6'>
                            Total: <span className='font-semibold'>${placedOrder.total.toFixed(2)}</span>
                        </p>
                        <Button className='w-full' onClick={() => setPlacedOrder(null)}>
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
                                    Phone
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

                        {submitError && (
                            <p className='text-sm text-red-600 mt-3'>{submitError}</p>
                        )}

                        <Button
                            className='w-full mt-4'
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                        >
                            {isSending ? 'Placing order…' : 'Place Order'}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
