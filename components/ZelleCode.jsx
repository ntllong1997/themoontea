'use client';

// The Zelle step of a ticket's payment: the shop's Zelle QR for the customer
// to scan from Zelle in their bank app, with the amount and ticket to type.
// The first time on a browser it asks for the shop's Zelle details instead.

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { getZelleSettings, saveZelleSettings, zelleQrUrl } from '@/lib/orders/zelle';

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm';

export default function ZelleCode({ total, orderNumber }) {
    const [settings, setSettings] = useState(() => getZelleSettings());
    const [isEditing, setIsEditing] = useState(!settings);

    if (isEditing) {
        return (
            <ZelleSetup
                initial={settings}
                onSaved={(saved) => {
                    setSettings(saved);
                    setIsEditing(false);
                }}
            />
        );
    }

    return (
        <div className='flex flex-col items-center gap-2'>
            <QRCodeSVG
                value={zelleQrUrl(settings)}
                size={208}
                marginSize={2}
                level='M'
                title={`Zelle QR code for ${settings.name}`}
                className='rounded-xl border border-gray-200'
            />
            <p className='text-sm font-semibold text-purple-700'>
                {settings.name} · {settings.recipient}
            </p>
            <p className='text-2xl font-bold'>${total.toFixed(2)}</p>
            <p className='text-xs text-gray-500'>
                Customer: open your bank app → Zelle → Send → scan this code. Type ${total.toFixed(2)} and &quot;ticket #{orderNumber}&quot;.
            </p>
            <button type='button' className='text-xs font-semibold text-gray-500 underline' onClick={() => setIsEditing(true)}>
                Change Zelle details
            </button>
        </div>
    );
}

function ZelleSetup({ initial, onSaved }) {
    const [name, setName] = useState(initial?.name ?? '');
    const [recipient, setRecipient] = useState(initial?.recipient ?? '');
    const [error, setError] = useState('');

    const save = () => {
        try {
            onSaved(saveZelleSettings({ name, recipient }));
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className='space-y-2 text-left'>
            <p className='text-sm font-semibold'>Set up the shop&apos;s Zelle once on this device</p>
            <input className={inputClass} placeholder='Name on Zelle (e.g. The Moon Tea)' value={name} onChange={(e) => setName(e.target.value)} />
            <input
                className={inputClass}
                placeholder='Zelle email or US phone'
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
            />
            {error && <p className='text-xs font-medium text-red-600'>{error}</p>}
            <button type='button' className='w-full rounded-xl bg-purple-700 px-3 py-2 text-sm font-semibold text-white' onClick={save}>
                Save Zelle details
            </button>
        </div>
    );
}
