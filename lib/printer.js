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

// Full origin including scheme, e.g. "http://192.168.43.100". Values saved by
// older builds may lack a scheme — treat those as http.
export function getPrinterAddress() {
    try {
        const stored = localStorage.getItem(PRINTER_URL_KEY) || '';
        if (!stored) return '';
        return /^https?:\/\//i.test(stored) ? stored : `http://${stored}`;
    } catch { return ''; }
}

// Accepts "192.168.43.100", "192.168.43.100:80", "http://192.168.43.100/",
// "https://…", or a full service URL — stores the normalized origin. The
// scheme is kept: https is needed when the site itself is served over https.
export function savePrinterAddress(input) {
    const trimmed = String(input || '').trim();
    if (!trimmed) {
        clearPrinterAddress();
        return '';
    }
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    let origin;
    try {
        origin = new URL(withProtocol).origin;
    } catch {
        throw new Error('Enter a valid printer address, e.g. 192.168.43.100');
    }
    if (!origin || origin === 'null') {
        throw new Error('Enter a valid printer address, e.g. 192.168.43.100');
    }
    localStorage.setItem(PRINTER_URL_KEY, origin);
    return origin;
}

export function clearPrinterAddress() {
    try { localStorage.removeItem(PRINTER_URL_KEY); } catch { /* ignore */ }
}

export function getPrinterMode() {
    return getPrinterAddress() ? 'wifi' : 'server';
}

// An https page cannot fetch an http printer — the browser blocks the request
// before it leaves ("mixed content"). Native apps have no such restriction,
// which is why the iOS app reaches the same IP fine.
export function isBlockedByMixedContent() {
    const address = getPrinterAddress();
    return Boolean(
        address &&
        typeof window !== 'undefined' &&
        window.location.protocol === 'https:' &&
        address.startsWith('http://')
    );
}

// ── ePOS-Print transport ─────────────────────────────────────────────────────

function eposEndpoint(origin, timeoutMs) {
    return `${origin}/cgi-bin/epos/service.cgi?devid=${EPOS_DEVICE_ID}&timeout=${timeoutMs}`;
}

async function sendEpos(origin, xml, printerTimeoutMs, fetchTimeoutMs) {
    const res = await fetch(eposEndpoint(origin, printerTimeoutMs), {
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
    const address = getPrinterAddress();
    if (address) {
        try {
            await sendEpos(address, buildStatusProbeXml(), EPOS_STATUS_TIMEOUT_MS, EPOS_STATUS_TIMEOUT_MS);
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
    const address = getPrinterAddress();

    if (address) {
        const xml = buildReceiptXml({ orderNumber, items, taxRate, cashappUrl });
        await sendEpos(address, xml, EPOS_PRINT_TIMEOUT_MS, EPOS_FETCH_TIMEOUT_MS);
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
    const address = getPrinterAddress();

    if (address) {
        await sendEpos(address, buildTestXml(), EPOS_PRINT_TIMEOUT_MS, EPOS_FETCH_TIMEOUT_MS);
        return;
    }

    const res = await fetch(`${PRINT_SERVER}/test`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(await res.text().catch(() => 'Test print failed'));
}

// Explains *why* the WiFi printer can't be reached, so the settings UI can
// give actionable guidance instead of a bare "unreachable".
// Returns { ok: boolean, reason?: string, detail?: string }.
export async function diagnosePrinter() {
    const address = getPrinterAddress();
    if (!address) return { ok: false, reason: 'no-address' };

    if (isBlockedByMixedContent()) return { ok: false, reason: 'mixed-content' };

    try {
        await sendEpos(address, buildStatusProbeXml(), EPOS_STATUS_TIMEOUT_MS, EPOS_STATUS_TIMEOUT_MS);
        return { ok: true };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof Error && err.name === 'TimeoutError') {
            return { ok: false, reason: 'timeout', detail: message };
        }
        if (message.startsWith('Printer responded with HTTP')) {
            return { ok: false, reason: 'http-status', detail: message };
        }
        if (message.startsWith('Print failed')) {
            return { ok: false, reason: 'epos-error', detail: message };
        }
        // fetch() TypeError — unreachable host, refused connection, CORS
        // rejection, or an untrusted self-signed https certificate.
        return { ok: false, reason: 'network', detail: message };
    }
}
