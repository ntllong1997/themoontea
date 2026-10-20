'use client';

// One ticket's payment page, like the iPhone app's Pay and Payment sheets.
// Unpaid: pick how the customer paid (no default), or cancel a walk-away.
// Paid: change the method or mark it unpaid. Cancelled: restore it.
// Every choice asks once more before it's saved.

import { useState } from 'react';
import Dialog from '@/components/admin/Dialog';
import {
    PAY_CHOICES,
    PAYMENT_METHOD_KEYS,
    canChangePayment,
    isChargedOnReader,
    methodLabel,
    paymentStateLabel,
} from '@/lib/orders/ticketPayments';

const choiceClass =
    'flex flex-col items-center justify-center gap-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-4 font-semibold hover:bg-gray-100 disabled:opacity-50';
const actionClass =
    'w-full rounded-xl border border-gray-200 px-3 py-3 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50';

const timeText = (iso) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

/** What each pending confirmation asks, and the button that confirms it. */
function confirmCopy(orderNumber, total, { action, method }) {
    const amount = `$${total.toFixed(2)}`;
    switch (action) {
        case 'pay': {
            const choice = PAY_CHOICES.find((c) => c.method === method);
            return { question: `Ticket #${orderNumber}: ${amount} by ${choice.title}?`, hint: choice.hint, button: `Paid by ${choice.title}` };
        }
        case 'cancel':
            return { question: `Cancel ticket #${orderNumber}?`, hint: 'For walk-aways. The ticket is kept and its number stays used.', button: 'Cancel ticket' };
        case 'changeMethod':
            return { question: `Change ticket #${orderNumber} to ${methodLabel(method)}?`, hint: '', button: `Change to ${methodLabel(method)}` };
        case 'markUnpaid':
            return { question: `Mark ticket #${orderNumber} as unpaid?`, hint: 'It goes back to Tickets so payment can be taken again.', button: 'Mark unpaid' };
        case 'restore':
            return { question: `Restore ticket #${orderNumber}?`, hint: 'It goes back to Tickets as unpaid.', button: 'Restore as unpaid' };
        default:
            return { question: '', hint: '', button: '' };
    }
}

export default function TicketPaymentDialog({ ticket, onClose, onChange }) {
    const [confirming, setConfirming] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const { orderNumber, status, total } = ticket;
    const isChangeable = canChangePayment(ticket);

    const save = async () => {
        setIsSaving(true);
        setError('');
        try {
            await onChange(ticket, confirming.action, confirming.method);
            onClose();
        } catch (err) {
            setError(err.message || 'Could not save. Please try again.');
            setConfirming(null);
        } finally {
            setIsSaving(false);
        }
    };

    const ask = (action, method) => () => setConfirming({ action, method });

    const title = status === 'pending' ? `Pay ticket #${orderNumber}` : `Ticket #${orderNumber} payment`;

    return (
        <Dialog title={title} onClose={isSaving ? () => {} : onClose} onSubmit={(e) => e.preventDefault()}>
            <div className='text-center mb-5'>
                <p className='text-[11px] font-medium tracking-widest text-gray-500'>
                    {status === 'pending' ? 'AMOUNT DUE' : paymentStateLabel(ticket).toUpperCase()}
                </p>
                <p className='text-5xl font-bold'>${total.toFixed(2)}</p>
                <p className='mt-1 text-sm text-gray-500'>{ticket.items.map((i) => i.displayName).join(', ')}</p>
            </div>

            {!isChangeable && (
                <p className='rounded-xl bg-gray-100 p-3 text-sm text-gray-600'>
                    This ticket was saved before payments were tracked, so it can&apos;t be changed.
                </p>
            )}

            {isChangeable && confirming && (
                <ConfirmStep
                    copy={confirmCopy(orderNumber, total, confirming)}
                    isDestructive={confirming.action === 'cancel'}
                    isSaving={isSaving}
                    onConfirm={save}
                    onBack={() => setConfirming(null)}
                />
            )}

            {isChangeable && !confirming && status === 'pending' && (
                <div className='space-y-3'>
                    <div className='grid grid-cols-3 gap-3'>
                        {PAY_CHOICES.map((choice) => (
                            <button key={choice.method} type='button' className={choiceClass} onClick={ask('pay', choice.method)}>
                                {choice.title}
                                {choice.method === 'Card' && <span className='text-[11px] font-normal text-gray-500'>Square app</span>}
                            </button>
                        ))}
                    </div>
                    <button type='button' className={`${actionClass} text-red-600`} onClick={ask('cancel')}>
                        Cancel ticket (walk-away)
                    </button>
                </div>
            )}

            {isChangeable && !confirming && status === 'paid' && (
                <div className='space-y-3'>
                    {isChargedOnReader(ticket) && (
                        <p className='rounded-xl bg-amber-50 p-3 text-xs text-amber-800'>
                            This card was really charged on an iPhone&apos;s reader. Changing it here doesn&apos;t refund it — refunds happen in Square Dashboard.
                        </p>
                    )}
                    <p className='text-xs font-medium tracking-widest text-gray-500'>CHANGE PAYMENT METHOD</p>
                    <div className='grid grid-cols-3 gap-3'>
                        {PAYMENT_METHOD_KEYS.map((method) => {
                            const isCurrent = ticket.paymentMethod === method;
                            return (
                                <button
                                    key={method}
                                    type='button'
                                    disabled={isCurrent}
                                    className={`${choiceClass} ${isCurrent ? 'border-green-500 bg-green-50' : ''}`}
                                    onClick={ask('changeMethod', method)}
                                >
                                    {methodLabel(method)}
                                    {isCurrent && <span className='text-[11px] font-normal text-green-700'>Current</span>}
                                </button>
                            );
                        })}
                    </div>
                    <button type='button' className={actionClass} onClick={ask('markUnpaid')}>Mark as unpaid</button>
                </div>
            )}

            {isChangeable && !confirming && status === 'cancelled' && (
                <button type='button' className={actionClass} onClick={ask('restore')}>Restore ticket</button>
            )}

            {error && <p className='mt-3 text-center text-sm font-medium text-red-600'>{error}</p>}

            <div className='mt-5 border-t pt-3'>
                <p className='mb-1 text-xs font-medium tracking-widest text-gray-500'>PAYMENT HISTORY</p>
                {ticket.paymentLog.length === 0 ? (
                    <p className='text-sm text-gray-400'>No changes recorded.</p>
                ) : (
                    <ul className='space-y-0.5 text-sm text-gray-600'>
                        {ticket.paymentLog.map((entry) => (
                            <li key={`${entry.at}-${entry.till}-${entry.to}`}>
                                {entry.from} → {entry.to}, {entry.till}, {timeText(entry.at)}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Dialog>
    );
}

function ConfirmStep({ copy, isDestructive, isSaving, onConfirm, onBack }) {
    return (
        <div className='space-y-3 rounded-xl border border-gray-200 p-4 text-center'>
            <p className='font-semibold'>{copy.question}</p>
            {copy.hint && <p className='text-sm text-gray-500'>{copy.hint}</p>}
            <div className='flex gap-2'>
                <button type='button' className={actionClass} onClick={onBack} disabled={isSaving}>
                    Not yet
                </button>
                <button
                    type='button'
                    onClick={onConfirm}
                    disabled={isSaving}
                    className={`w-full rounded-xl px-3 py-3 text-sm font-semibold text-white disabled:opacity-50 ${isDestructive ? 'bg-red-600 hover:bg-red-700' : 'bg-black hover:bg-gray-800'}`}
                >
                    {isSaving ? 'Saving…' : copy.button}
                </button>
            </div>
        </div>
    );
}
