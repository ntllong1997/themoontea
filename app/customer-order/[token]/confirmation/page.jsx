'use client';

import { useSearchParams } from 'next/navigation';

const PAYMENT_LABELS = {
    cash: { label: 'Cash', icon: '💵' },
    cashapp: { label: 'CashApp', icon: '💚' },
    card: { label: 'Card / Tap', icon: '💳' },
};

export default function ConfirmationPage() {
    const searchParams = useSearchParams();
    const orderNumber = searchParams.get('order');
    const total = searchParams.get('total');
    const paymentKey = searchParams.get('payment') || '';
    const payment = PAYMENT_LABELS[paymentKey] ?? { label: paymentKey, icon: '💳' };

    return (
        <div className='flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center'>
            <div className='text-6xl'>🧋</div>
            <div>
                <h1 className='text-3xl font-bold mb-1'>Order Placed!</h1>
                {orderNumber && (
                    <p className='text-gray-500 text-lg'>Order #{orderNumber}</p>
                )}
            </div>

            <div className='bg-gray-50 rounded-xl px-8 py-5 w-full max-w-xs space-y-3'>
                {total && (
                    <div className='flex justify-between text-base font-semibold'>
                        <span>Total Due</span>
                        <span>${total}</span>
                    </div>
                )}
                <div className='flex justify-between text-sm text-gray-600'>
                    <span>Payment</span>
                    <span>{payment.icon} {payment.label}</span>
                </div>
            </div>

            <div className='bg-blue-50 border border-blue-200 rounded-xl px-6 py-4 max-w-xs'>
                <p className='text-blue-800 font-semibold mb-1'>Pay at the counter</p>
                <p className='text-blue-600 text-sm'>
                    Please pay {payment.icon} {payment.label} when you pick up your order.
                </p>
            </div>

            <p className='text-gray-400 text-sm max-w-xs'>
                We&apos;ll prepare your order shortly. Step aside and we&apos;ll call your number when it&apos;s ready!
            </p>
        </div>
    );
}
