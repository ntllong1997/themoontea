'use client';

// "Add to iPhone Calendar": subscribes the phone to /menu/popups.ics, so the
// pop-ups show in the Calendar app and stay up to date on their own.

import { useEffect, useState } from 'react';
import { CalendarCheck, Check, Copy } from 'lucide-react';

export const FEED_PATH = '/menu/popups.ics';

export default function CalendarSubscribe() {
    const [host, setHost] = useState('');
    const [copied, setCopied] = useState(false);

    // The site's own address, read after load (it differs on previews).
    useEffect(() => setHost(window.location.host), []);
    if (!host) return null;

    const httpsUrl = `https://${host}${FEED_PATH}`;

    async function copy() {
        try {
            await navigator.clipboard.writeText(httpsUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            window.prompt('Copy this link:', httpsUrl);
        }
    }

    return (
        <section aria-labelledby='calendar-subscribe' className='rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200'>
            <h2 id='calendar-subscribe' className='flex items-center gap-2 font-semibold'>
                <CalendarCheck className='h-5 w-5' aria-hidden /> See pop-ups in your phone&apos;s calendar
            </h2>
            <p className='mt-1 text-sm text-gray-500'>
                Tap once on your iPhone and confirm <strong>Subscribe</strong>. New and changed pop-ups then show up in the
                Calendar app on their own (it checks about every hour).
            </p>
            <div className='mt-3 flex flex-wrap gap-2'>
                <a
                    href={`webcal://${host}${FEED_PATH}`}
                    className='inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 font-semibold text-white hover:opacity-80'
                >
                    <CalendarCheck className='h-4 w-4' aria-hidden /> Add to iPhone Calendar
                </a>
                <button
                    type='button'
                    onClick={copy}
                    className='inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold ring-1 ring-gray-300 hover:bg-gray-50'
                >
                    {copied ? <Check className='h-4 w-4' aria-hidden /> : <Copy className='h-4 w-4' aria-hidden />}
                    {copied ? 'Link copied' : 'Copy link (Google Calendar, Android)'}
                </button>
            </div>
            <p className='sr-only' aria-live='polite'>
                {copied ? 'Calendar link copied' : ''}
            </p>
        </section>
    );
}
