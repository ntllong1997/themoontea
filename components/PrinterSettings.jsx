'use client';

import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import {
    clearPrinterHost,
    getPrinterHost,
    printTest,
    savePrinterHost,
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

// Printer status row + expandable settings to point the site at a WiFi
// printer (Epson ePOS) instead of the local USB print server.
export default function PrinterSettings({ status, onChanged }) {
    const [expanded, setExpanded] = useState(false);
    const [savedHost, setSavedHost] = useState('');
    const [draft, setDraft] = useState('');
    const [message, setMessage] = useState(null); // { text, isError }
    const [isHttpsPage, setIsHttpsPage] = useState(false);
    const [isTesting, setIsTesting] = useState(false);

    useEffect(() => {
        const host = getPrinterHost();
        setSavedHost(host);
        setDraft(host);
        setIsHttpsPage(window.location.protocol === 'https:');
    }, []);

    const isWifiMode = savedHost !== '';
    const label = (isWifiMode ? WIFI_STATUS_LABEL : SERVER_STATUS_LABEL)[status]
        ?? SERVER_STATUS_LABEL.disconnected;

    const handleSave = () => {
        try {
            const host = savePrinterHost(draft);
            setSavedHost(host);
            setDraft(host);
            setMessage({
                text: host ? `Saved — connecting to ${host}…` : 'Cleared — using local print server.',
                isError: false,
            });
            onChanged?.();
        } catch (err) {
            setMessage({ text: err.message, isError: true });
        }
    };

    const handleClear = () => {
        clearPrinterHost();
        setSavedHost('');
        setDraft('');
        setMessage({ text: 'Cleared — using local print server.', isError: false });
        onChanged?.();
    };

    const handleTest = async () => {
        setIsTesting(true);
        setMessage(null);
        try {
            await printTest();
            setMessage({ text: 'Test receipt sent.', isError: false });
        } catch (err) {
            setMessage({ text: `Test print failed: ${err.message}`, isError: true });
        } finally {
            setIsTesting(false);
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

            {!expanded && status !== 'connected' && (
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
                        Enter the Epson printer&rsquo;s IP on the phone hotspot network.
                        Leave empty to use the local USB print server.
                    </p>

                    {isHttpsPage && (
                        <p className='text-xs text-amber-600'>
                            This page is loaded over HTTPS — browsers block direct HTTP
                            printing. Open the site via http:// to print over WiFi.
                        </p>
                    )}

                    <div className='flex items-center gap-2'>
                        <button
                            onClick={handleSave}
                            className='rounded px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors'
                        >
                            Save
                        </button>
                        {savedHost && (
                            <button
                                onClick={handleClear}
                                className='rounded px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors'
                            >
                                Clear
                            </button>
                        )}
                        <button
                            onClick={handleTest}
                            disabled={isTesting}
                            className='ml-auto rounded px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50'
                        >
                            {isTesting ? 'Printing…' : 'Test print'}
                        </button>
                    </div>

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
