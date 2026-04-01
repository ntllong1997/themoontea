'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { getLatestOrderNumber, saveOrderHistory } from '@/lib/db';

const TAX_RATE = 0.0825;
const PRICES = { Boba: 8.0, Corndog: 9.0 };

const DRINK_OPTIONS = [
    'Brown Sugar',
    'Matcha Brown Sugar',
    'Golden Taro',
    'Korean Strawberry',
    'Tropical',
    'Strawberry',
    'Cafe',
    'Matcha Strawberry',
];

const BOBA_OPTIONS = ['Tapioca', 'Mango Popping', 'Strawberry Popping', 'Nothing'];

const CORNDOG_OPTIONS = [
    'Cheese Potato',
    'Cheese Hot Cheeto',
    'Half-Half Potato',
    'Half-Half Hot Cheeto',
    'Cheese Original',
    'Half-Half Original',
];

const PAYMENT_METHODS = [
    { id: 'cash', label: 'Cash', icon: '💵' },
    { id: 'cashapp', label: 'CashApp', icon: '💚' },
    { id: 'card', label: 'Card / Tap', icon: '💳' },
];

export default function CustomerOrderPage() {
    const { token } = useParams();
    const router = useRouter();

    const [tokenStatus, setTokenStatus] = useState('loading'); // 'loading' | 'valid' | 'invalid'
    const [invalidReason, setInvalidReason] = useState('');
    const [expiresAt, setExpiresAt] = useState(null);

    const [selectedDrink, setSelectedDrink] = useState('');
    const [selectedBoba, setSelectedBoba] = useState('');
    const [selectedCorndog, setSelectedCorndog] = useState('');
    const [cart, setCart] = useState([]);
    const [phone, setPhone] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

    // Validate token on mount
    useEffect(() => {
        if (!token) return;
        fetch(`/api/sessions?token=${token}`)
            .then((r) => r.json())
            .then((data) => {
                if (data.valid) {
                    setTokenStatus('valid');
                    setExpiresAt(new Date(data.expiresAt));
                } else {
                    setTokenStatus('invalid');
                    setInvalidReason(data.reason || 'This link is not valid.');
                }
            })
            .catch(() => {
                setTokenStatus('invalid');
                setInvalidReason('Unable to verify your session. Please ask the vendor.');
            });
    }, [token]);

    // Countdown to expiry — re-check validity if expired
    useEffect(() => {
        if (!expiresAt) return;
        const id = setInterval(() => {
            if (new Date() >= expiresAt) {
                setTokenStatus('invalid');
                setInvalidReason('Your ordering session has expired. Please ask the vendor for a new link.');
                clearInterval(id);
            }
        }, 5000);
        return () => clearInterval(id);
    }, [expiresAt]);

    const handleAddBoba = useCallback(() => {
        if (!selectedDrink || !selectedBoba) return;
        const name = `${selectedDrink} with ${selectedBoba}`;
        setCart((prev) => {
            const idx = prev.findIndex((i) => i.name === name);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
                return next;
            }
            return [...prev, { name, price: PRICES.Boba, type: 'Boba', quantity: 1 }];
        });
        setSelectedDrink('');
        setSelectedBoba('');
    }, [selectedDrink, selectedBoba]);

    const handleAddCorndog = useCallback(() => {
        if (!selectedCorndog) return;
        setCart((prev) => {
            const idx = prev.findIndex((i) => i.name === selectedCorndog);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
                return next;
            }
            return [...prev, { name: selectedCorndog, price: PRICES.Corndog, type: 'Corndog', quantity: 1 }];
        });
        setSelectedCorndog('');
    }, [selectedCorndog]);

    const handleQuantityChange = useCallback((index, delta) => {
        setCart((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], quantity: next[index].quantity + delta };
            if (next[index].quantity <= 0) next.splice(index, 1);
            return next;
        });
    }, []);

    const handleSubmit = useCallback(async () => {
        if (cart.length === 0 || !paymentMethod) return;
        setSubmitting(true);
        setSubmitError('');
        try {
            // Re-validate token before saving
            const check = await fetch(`/api/sessions?token=${token}`).then((r) => r.json());
            if (!check.valid) {
                setTokenStatus('invalid');
                setInvalidReason(check.reason || 'Your session is no longer valid.');
                return;
            }

            const latestOrderNumber = await getLatestOrderNumber();
            const nextOrderNumber = latestOrderNumber + 1;
            const timestamp = new Date().toISOString();

            const enrichedOrders = cart.flatMap((item) =>
                Array.from({ length: item.quantity }).map(() => ({
                    orderNumber: nextOrderNumber,
                    name: item.name,
                    price: item.price,
                    type: item.type,
                    timestamp,
                    phone: phone.trim() || null,
                    payment_method: paymentMethod,
                }))
            );

            await saveOrderHistory(enrichedOrders);

            // Mark token as used
            await fetch('/api/sessions', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'use', token, orderNumber: nextOrderNumber }),
            });

            router.push(
                `/customer-order/${token}/confirmation?order=${nextOrderNumber}&total=${(subtotal + subtotal * TAX_RATE).toFixed(2)}&payment=${paymentMethod}`
            );
        } catch (err) {
            console.error(err);
            setSubmitError('Failed to place order. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }, [cart, paymentMethod, phone, token, router]);

    const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const tax = subtotal * TAX_RATE;
    const total = subtotal + tax;

    const canSubmit = cart.length > 0 && paymentMethod && !submitting;

    if (tokenStatus === 'loading') {
        return (
            <div className='flex min-h-screen items-center justify-center'>
                <p className='text-gray-500'>Verifying your link…</p>
            </div>
        );
    }

    if (tokenStatus === 'invalid') {
        return (
            <div className='flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center'>
                <div className='text-5xl'>🔒</div>
                <h1 className='text-2xl font-bold'>It&apos;s not your turn yet</h1>
                <p className='text-gray-500 max-w-xs'>{invalidReason}</p>
                <p className='text-sm text-gray-400 mt-2'>
                    Please wait in line and ask the vendor for your ordering link when it&apos;s your turn.
                </p>
            </div>
        );
    }

    return (
        <div className='max-w-2xl mx-auto px-4 py-6 pb-24'>
            <div className='mb-6 text-center'>
                <h1 className='text-2xl font-bold'>The Moon Tea</h1>
                <p className='text-gray-500 text-sm mt-1'>Place your order below</p>
            </div>

            {/* Boba Section */}
            <Card className='mb-4'>
                <CardContent>
                    <p className='font-semibold text-blue-700 border-b pb-1 mb-3'>Boba — $8.00</p>
                    <div className='grid grid-cols-2 gap-4 mb-3'>
                        <div>
                            <p className='text-xs font-medium uppercase tracking-wide text-gray-500 mb-2'>Drink</p>
                            <div className='flex flex-col gap-1'>
                                {DRINK_OPTIONS.map((drink) => (
                                    <Button
                                        key={drink}
                                        variant={selectedDrink === drink ? 'default' : 'outline'}
                                        className='w-full text-sm'
                                        onClick={() => setSelectedDrink(drink)}
                                    >
                                        {drink}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className='text-xs font-medium uppercase tracking-wide text-gray-500 mb-2'>Boba</p>
                            <div className='flex flex-col gap-1'>
                                {BOBA_OPTIONS.map((boba) => (
                                    <Button
                                        key={boba}
                                        variant={selectedBoba === boba ? 'default' : 'outline'}
                                        className='w-full text-sm'
                                        onClick={() => setSelectedBoba(boba)}
                                    >
                                        {boba}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <Button onClick={handleAddBoba} className='w-full' disabled={!selectedDrink || !selectedBoba}>
                        + Add Boba
                    </Button>
                </CardContent>
            </Card>

            {/* Corndog Section */}
            <Card className='mb-4'>
                <CardContent>
                    <p className='font-semibold text-blue-700 border-b pb-1 mb-3'>Corndog — $9.00</p>
                    <div className='grid grid-cols-2 gap-2 mb-3'>
                        {CORNDOG_OPTIONS.map((corndog) => (
                            <Button
                                key={corndog}
                                variant={selectedCorndog === corndog ? 'default' : 'outline'}
                                className='w-full text-sm'
                                onClick={() => setSelectedCorndog(corndog)}
                            >
                                {corndog}
                            </Button>
                        ))}
                    </div>
                    <Button onClick={handleAddCorndog} className='w-full' disabled={!selectedCorndog}>
                        + Add Corndog
                    </Button>
                </CardContent>
            </Card>

            {/* Cart + Checkout */}
            <Card>
                <CardContent>
                    <h2 className='text-lg font-bold mb-3'>Your Order</h2>

                    {cart.length === 0 ? (
                        <p className='text-gray-400 text-sm text-center py-4'>No items added yet.</p>
                    ) : (
                        <div className='space-y-3 mb-4'>
                            {cart.map((item, index) => (
                                <div
                                    key={`${item.type}-${item.name}`}
                                    className='flex justify-between items-start gap-2 pb-2 border-b last:border-0'
                                >
                                    <div className='flex-1 min-w-0'>
                                        <p className='text-sm font-medium'>{item.name}</p>
                                        <p className='text-xs text-gray-500'>
                                            ${item.price.toFixed(2)} × {item.quantity} = $
                                            {(item.price * item.quantity).toFixed(2)}
                                        </p>
                                    </div>
                                    <div className='flex items-center gap-1 shrink-0'>
                                        <Button size='sm' variant='outline' onClick={() => handleQuantityChange(index, -1)}>−</Button>
                                        <Button size='sm' variant='outline' onClick={() => handleQuantityChange(index, 1)}>+</Button>
                                        <Button variant='destructive' size='sm' onClick={() => handleQuantityChange(index, -item.quantity)}>✕</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {cart.length > 0 && (
                        <div className='border-t pt-3 space-y-1 text-sm mb-4'>
                            <div className='flex justify-between'><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                            <div className='flex justify-between text-gray-500'><span>Tax (8.25%)</span><span>${tax.toFixed(2)}</span></div>
                            <div className='flex justify-between font-bold text-base pt-1'><span>Total</span><span>${total.toFixed(2)}</span></div>
                        </div>
                    )}

                    {/* Phone */}
                    <div className='mb-4'>
                        <label className='block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1'>
                            Phone (optional — for pickup notification)
                        </label>
                        <input
                            type='tel'
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder='(555) 000-0000'
                            className='w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500'
                        />
                    </div>

                    {/* Payment Method */}
                    <div className='mb-4'>
                        <p className='text-xs font-medium uppercase tracking-wide text-gray-500 mb-2'>
                            How will you pay? <span className='text-red-500'>*</span>
                        </p>
                        <div className='flex gap-2'>
                            {PAYMENT_METHODS.map(({ id, label, icon }) => (
                                <button
                                    key={id}
                                    onClick={() => setPaymentMethod(id)}
                                    className={`flex-1 rounded border px-3 py-2 text-sm font-medium transition-colors ${
                                        paymentMethod === id
                                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                                            : 'border-gray-300 text-gray-600 hover:border-gray-400'
                                    }`}
                                >
                                    {icon} {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {submitError && (
                        <p className='text-red-600 text-sm mb-3'>{submitError}</p>
                    )}

                    <Button
                        onClick={handleSubmit}
                        className='w-full'
                        disabled={!canSubmit}
                    >
                        {submitting ? 'Placing order…' : 'Place Order'}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
