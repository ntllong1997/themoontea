'use client';

import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import {
    clearPrinterAddress,
    diagnosePrinter,
    getPrinterAddress,
    isBlockedByMixedContent,
    printTest,
    savePrinterAddress,
} from '@/lib/printer';

const WIFI_STATUS_LABEL = {
    connected: { text: 'Ready (WiFi)', className: 'text-green-600' },
    error: { text: 'Printer problem', className: 'text-red-500' },
    disconnected: { text: 'Unreachable', className: 'text-red-500' },
};

const SERVER_STATUS_LABEL = {
    connected: { text: 'Ready', className: 'text-green-600' },
    error: { text: 'No printer', className: 'text-red-500' },
    disconnected: { text: 'Server offline', className: 'text-gray-400' },
};

function diagnosisMessage(result, address) {
    const isHttpsPrinter = address.startsWith('https://');
    switch (result.reason) {
        case 'no-address':
            return 'No printer address saved.';
        case 'mixed-content':
            return 'This site is loaded over HTTPS, so the browser blocks the ' +
                'http:// printer — the request never leaves the browser. Either open ' +
                'the site via http://, or enable SSL/TLS on the printer (Epson TM ' +
                'Utility app) and save the address as https://… instead.';
        case 'timeout':
            return 'The printer did not answer in time. Check it is powered on and ' +
                'joined to the same hotspot network as this device.';
        case 'http-status':
            return `The device answered but refused ePOS-Print (${result.detail}). ` +
                'Make sure ePOS-Print is enabled on the printer (Epson TM Utility app).';
        case 'epos-error':
            return `The printer was reached but reported a problem (${result.detail}). ` +
                'Check paper and that the cover is closed.';
        default: // network
            return isHttpsPrinter
                ? 'Could not reach the printer. Its https certificate is self-signed, ' +
                  'so the browser rejects it until you trust it once: tap "Open printer ' +
                  'page" below, accept the certificate warning, then check again. Also ' +
                  'confirm the printer is on the same hotspot network.'
                : 'Could not reach the printer. Confirm this device and the printer are ' +
                  'on the same hotspot network and the IP is current (hotspots often ' +
                  'hand out a new IP when the printer rejoins).';
    }
}

// Printer status row + expandable settings to point the site at a WiFi
// printer (Epson ePOS) instead of the local USB print server.
export default function PrinterSettings({ status, onChanged }) {
    const [expanded, setExpanded] = useState(false);
    const [savedAddress, setSavedAddress] = useState('');
    const [draft, setDraft] = useState('');
    const [message, setMessage] = useState(null); // { text, isError }
    const [isMixedContentBlocked, setIsMixedContentBlocked] = useState(false);
    const [isBusy, setIsBusy] = useState(false);

    useEffect(() => {
        const address = getPrinterAddress();
        setSavedAddress(address);
        setDraft(address);
        setIsMixedContentBlocked(isBlockedByMixedContent());
    }, []);

    const isWifiMode = savedAddress !== '';
    const label = (isWifiMode ? WIFI_STATUS_LABEL : SERVER_STATUS_LABEL)[status]
        ?? SERVER_STATUS_LABEL.disconnected;

    const handleSave = () => {
        try {
            const address = savePrinterAddress(draft);
            setSavedAddress(address);
            setDraft(address);
            setIsMixedContentBlocked(isBlockedByMixedContent());
            setMessage({
                text: address ? `Saved — connecting to ${address}…` : 'Cleared — using local print server.',
                isError: false,
            });
            onChanged?.();
        } catch (err) {
            setMessage({ text: err.message, isError: true });
        }
    };

    const handleClear = () => {
        clearPrinterAddress();
        setSavedAddress('');
        setDraft('');
        setIsMixedContentBlocked(false);
        setMessage({ text: 'Cleared — using local print server.', isError: false });
        onChanged?.();
    };

    const handleCheck = async () => {
        setIsBusy(true);
        setMessage(null);
        try {
            const result = await diagnosePrinter();
            setMessage(result.ok
                ? { text: 'Printer reached — ready to print.', isError: false }
                : { text: diagnosisMessage(result, savedAddress), isError: true });
        } finally {
            setIsBusy(false);
            onChanged?.();
        }
    };

    const handleTest = async () => {
        setIsBusy(true);
        setMessage(null);
        try {
            await printTest();
            setMessage({ text: 'Test receipt sent.', isError: false });
        } catch (err) {
            setMessage({ text: `Test print failed: ${err.message}`, isError: true });
        } finally {
            setIsBusy(false);
        }
    };

    return (
        <div className='mt-4 border-t pt-3'>
            <div className='flex items-center justify-between'>
                <span className='text-sm font-medium'>Printer</span>
                <span className='flex items-center gap-2'>
                    <span className={`text-xs font-semibold ${label.className}`}>{label.text}</span>
                    <button
                        onClick={() => setExpanded((v) => !v)}
                        className='p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors'
                        title='Printer settings'
                        aria-label='Printer settings'
                    >
                        <Settings size={14} />
                    </button>
                </span>
            </div>

            {isMixedContentBlocked && (
                <p className='text-xs text-amber-600 mt-1'>
                    This site is on HTTPS, so the browser blocks the http:// printer.
                    Open ⚙ settings for fixes.
                </p>
            )}

            {!expanded && !isMixedContentBlocked && status !== 'connected' && (
                <p className='text-xs text-gray-400 mt-1'>
                    {isWifiMode
                        ? 'Check the printer is on and joined to the phone hotspot.'
                        : <>Run <span className='font-mono bg-gray-100 px-1 rounded'>npm run print-server</span>, or set a WiFi printer in ⚙ settings.</>}
                </p>
            )}

            {expanded && (
                <div className='mt-2 space-y-2'>
                    <label className='block text-xs font-medium uppercase tracking-wide text-gray-500'>
                        WiFi printer address
                    </label>
                    <input
                        type='text'
                        inputMode='url'
                        autoCapitalize='none'
                        autoCorrect='off'
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder='e.g. 192.168.43.100'
                        className='w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500'
                    />
                    <p className='text-xs text-gray-400'>
                        Enter the Epson printer&rsquo;s IP on the phone hotspot network
                        (add https:// if the printer has SSL/TLS enabled).
                        Leave empty to use the local USB print server.
                    </p>

                    <div className='flex items-center gap-2 flex-wrap'>
                        <button
                            onClick={handleSave}
                            className='rounded px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors'
                        >
                            Save
                        </button>
                        {savedAddress && (
                            <button
                                onClick={handleClear}
                                className='rounded px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors'
                            >
                                Clear
                            </button>
                        )}
                        {savedAddress && (
                            <button
                                onClick={handleCheck}
                                disabled={isBusy}
                                className='rounded px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50'
                            >
                                Check connection
                            </button>
                        )}
                        <button
                            onClick={handleTest}
                            disabled={isBusy}
                            className='ml-auto rounded px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50'
                        >
                            {isBusy ? 'Working…' : 'Test print'}
                        </button>
                    </div>

                    {savedAddress.startsWith('https://') && (
                        <a
                            href={savedAddress}
                            target='_blank'
                            rel='noreferrer'
                            className='inline-block text-xs font-medium text-blue-600 hover:underline'
                        >
                            Open printer page (accept its certificate once) ↗
                        </a>
                    )}

                    {message && (
                        <p className={`text-xs font-medium ${message.isError ? 'text-red-600' : 'text-green-700'}`}>
                            {message.text}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
