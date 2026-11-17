// Printing has two modes, chosen by whether a WiFi printer address is saved:
//  1. WiFi — the browser POSTs ePOS-Print XML straight to an Epson network
//     printer (e.g. one joined to the phone's hotspot). Enter its address in
//     the Printer settings on the order page.
//  2. Local server — talks to print-server.js on localhost:3333 (USB printer).

import {
    buildReceiptXml,
    buildStatusProbeXml,
    buildTestXml,
    parseEposResponse,
} from '@/lib/eposXml';

const PRINT_SERVER   = 'http://127.0.0.1:3333';
const DEFAULT_CASHAPP = 'https://cash.app/$TheMoonTea';

const PRINTER_URL_KEY = 'wifiPrinterHost';
const EPOS_DEVICE_ID = 'local_printer';
const EPOS_PRINT_TIMEOUT_MS = 60000;
const EPOS_STATUS_TIMEOUT_MS = 4000;
const EPOS_FETCH_TIMEOUT_MS = 8000;

function getActiveCashApp() {
    try { return localStorage.getItem('cashappActive') || DEFAULT_CASHAPP; }
    catch { return DEFAULT_CASHAPP; }
}

// ── WiFi printer address (localStorage) ──────────────────────────────────────

export function getPrinterHost() {
    try { return localStorage.getItem(PRINTER_URL_KEY) || ''; }
    catch { return ''; }
}

// Accepts "192.168.43.100", "192.168.43.100:80", "http://192.168.43.100/",
// or a full service URL — stores the normalized host[:port].
export function savePrinterHost(input) {
    const trimmed = String(input || '').trim();
    if (!trimmed) {
        clearPrinterHost();
        return '';
    }
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    let host;
    try {
        host = new URL(withProtocol).host;
    } catch {
        throw new Error('Enter a valid printer address, e.g. 192.168.43.100');
    }
    if (!host) throw new Error('Enter a valid printer address, e.g. 192.168.43.100');
    localStorage.setItem(PRINTER_URL_KEY, host);
    return host;
}

export function clearPrinterHost() {
    try { localStorage.removeItem(PRINTER_URL_KEY); } catch { /* ignore */ }
}

export function getPrinterMode() {
    return getPrinterHost() ? 'wifi' : 'server';
}

// ── ePOS-Print transport ─────────────────────────────────────────────────────

function eposEndpoint(host, timeoutMs) {
    return `http://${host}/cgi-bin/epos/service.cgi?devid=${EPOS_DEVICE_ID}&timeout=${timeoutMs}`;
}

async function sendEpos(host, xml, printerTimeoutMs, fetchTimeoutMs) {
    const res = await fetch(eposEndpoint(host, printerTimeoutMs), {
        method: 'POST',
        headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': '""',
        },
        body: xml,
        signal: AbortSignal.timeout(fetchTimeoutMs),
    });
    if (!res.ok) throw new Error(`Printer responded with HTTP ${res.status}`);
    const parsed = parseEposResponse(await res.text());
    if (!parsed.success) {
        throw new Error(`Print failed${parsed.code ? ` (${parsed.code})` : ''}`);
    }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function checkPrinterStatus() {
    const host = getPrinterHost();
    if (host) {
        try {
            await sendEpos(host, buildStatusProbeXml(), EPOS_STATUS_TIMEOUT_MS, EPOS_STATUS_TIMEOUT_MS);
            return 'connected';
        } catch (err) {
            // Reached the printer but it reported a problem (cover open, no paper…)
            return err instanceof Error && err.message.startsWith('Print failed')
                ? 'error'
                : 'disconnected';
        }
    }

    try {
        const res  = await fetch(`${PRINT_SERVER}/status`, { signal: AbortSignal.timeout(2000) });
        const data = await res.json();
        return data.ready ? 'connected' : 'error';
    } catch {
        return 'disconnected';
    }
}

export async function printReceipt({ orderNumber, items, taxRate }) {
    const cashappUrl = getActiveCashApp();
    const host = getPrinterHost();

    if (host) {
        const xml = buildReceiptXml({ orderNumber, items, taxRate, cashappUrl });
        await sendEpos(host, xml, EPOS_PRINT_TIMEOUT_MS, EPOS_FETCH_TIMEOUT_MS);
        return;
    }

    const res = await fetch(`${PRINT_SERVER}/print`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderNumber, items, taxRate, cashappUrl }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Print failed');
    }
}

export async function printTest() {
    const host = getPrinterHost();

    if (host) {
        await sendEpos(host, buildTestXml(), EPOS_PRINT_TIMEOUT_MS, EPOS_FETCH_TIMEOUT_MS);
        return;
    }

    const res = await fetch(`${PRINT_SERVER}/test`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(await res.text().catch(() => 'Test print failed'));
}
