'use client';

// Staff-facing: prints/downloads the QR code customers scan to reach
// /order/online. One per location, since the online page reads `?location=`
// to know which till's queue and order-number sequence to write into.
//
// Generated entirely client-side (the `qrcode` package works against the
// browser's own <canvas>) — no external QR-image service, so this works
// offline and never leaks the shop's order URL to a third party.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { LOCATIONS } from '@/lib/locations';
import { Card, CardContent } from '@/components/ui/Card';

function useOrderUrl(locationId) {
    const [url, setUrl] = useState('');
    useEffect(() => {
        if (typeof window === 'undefined') return;
        setUrl(`${window.location.origin}/order/online?location=${locationId}`);
    }, [locationId]);
    return url;
}

function LocationQr({ location }) {
    const url = useOrderUrl(location.id);
    const [dataUrl, setDataUrl] = useState('');

    useEffect(() => {
        if (!url) return;
        QRCode.toDataURL(url, { width: 480, margin: 2 })
            .then(setDataUrl)
            .catch((err) => console.error('[qr] failed to render:', err));
    }, [url]);

    return (
        <Card className='flex flex-col items-center gap-3 text-center'>
            <CardContent className='flex flex-col items-center gap-3'>
                <h2 className='text-lg font-bold'>{location.label}</h2>
                {dataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a data: URL, Next's Image loader gains nothing here
                    <img src={dataUrl} alt={`QR code to order online at ${location.label}`} className='w-56 h-56' />
                ) : (
                    <div className='w-56 h-56 bg-gray-100 animate-pulse rounded' />
                )}
                <p className='text-xs text-gray-500 break-all max-w-xs'>{url}</p>
                {dataUrl && (
                    <a
                        href={dataUrl}
                        download={`moontea-order-qr-location-${location.id}.png`}
                        className='text-sm font-semibold text-blue-600 hover:underline'
                    >
                        Download PNG
                    </a>
                )}
            </CardContent>
        </Card>
    );
}

export default function OrderQrPage() {
    return (
        <div className='min-h-screen bg-gray-50 p-6 print:p-0'>
            <div className='max-w-3xl mx-auto space-y-6'>
                <div className='flex items-center gap-3 print:hidden'>
                    <Link href='/vendor' className='text-gray-400 hover:text-gray-600 text-sm'>← Back</Link>
                    <h1 className='text-xl font-bold'>Order QR Codes</h1>
                </div>
                <p className='text-sm text-gray-500 print:hidden'>
                    Print one of these for each register or table. Scanning it opens the
                    self-order page for that location.
                </p>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-6'>
                    {LOCATIONS.map((location) => (
                        <LocationQr key={location.id} location={location} />
                    ))}
                </div>
            </div>
        </div>
    );
}
