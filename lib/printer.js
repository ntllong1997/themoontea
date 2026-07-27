// Talks to the local print server (print-server.js) running on localhost:3333.

const PRINT_SERVER   = 'http://127.0.0.1:3333';
const DEFAULT_CASHAPP = 'https://cash.app/$TheMoonTea';

function getActiveCashApp() {
    try { return localStorage.getItem('cashappActive') || DEFAULT_CASHAPP; }
    catch { return DEFAULT_CASHAPP; }
}

export async function checkPrinterStatus() {
    try {
        const res  = await fetch(`${PRINT_SERVER}/status`, { signal: AbortSignal.timeout(2000) });
        const data = await res.json();
        return data.ready ? 'connected' : 'error';
    } catch {
        return 'disconnected';
    }
}

export async function printReceipt({ orderNumber, items, taxRate }) {
    const res = await fetch(`${PRINT_SERVER}/print`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderNumber, items, taxRate, cashappUrl: getActiveCashApp() }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Print failed');
    }
}
