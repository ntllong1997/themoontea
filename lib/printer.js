import { TAX_RATE } from '@/lib/constants';

let ws = null;

const W = 32; // characters per line (80 mm paper)

function pad(left, right) {
    return left + ' '.repeat(Math.max(1, W - left.length - right.length)) + right;
}

function buildSOAP(innerXml) {
    return (
        '<?xml version="1.0" encoding="utf-8"?>' +
        '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
        '<s:Body>' +
        '<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">' +
        innerXml +
        '</epos-print>' +
        '</s:Body>' +
        '</s:Envelope>'
    );
}

export function printerUrl(ip) {
    return `wss://${ip}:8043/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`;
}

export function connectPrinter(ip) {
    return new Promise((resolve, reject) => {
        if (ws) { ws.close(); ws = null; }

        const socket = new WebSocket(printerUrl(ip));

        const timer = setTimeout(() => {
            socket.close();
            reject(new Error('timeout'));
        }, 8000);

        socket.onopen = () => {
            clearTimeout(timer);
            ws = socket;
            resolve();
        };

        socket.onclose = () => { ws = null; };
        socket.onerror = () => { clearTimeout(timer); reject(new Error('failed')); };
    });
}

export function disconnectPrinter() {
    if (ws) { ws.close(); ws = null; }
}

export function isPrinterReady() {
    return ws !== null && ws.readyState === WebSocket.OPEN;
}

export function printReceipt({ orderNumber, items, taxRate }) {
    if (!isPrinterReady()) throw new Error('Printer not connected');

    const grouped = {};
    items.forEach(({ name, price }) => {
        if (!grouped[name]) grouped[name] = { name, price, qty: 0 };
        grouped[name].qty++;
    });

    const subtotal = items.reduce((s, i) => s + i.price, 0);
    const tax = subtotal * taxRate;
    const total = subtotal + tax;
    const dateStr = new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
    });

    const div = `<text>${'-'.repeat(W)}&#10;</text>`;

    const itemLines = Object.values(grouped)
        .map(({ name, price, qty }) => {
            const label = qty > 1 ? `${name} x${qty}` : name;
            return `<text>${pad(label, `$${(price * qty).toFixed(2)}`)}&#10;</text>`;
        })
        .join('');

    const xml =
        `<text align="center" bold="true" width="2" height="2">The Moon Tea&#10;</text>` +
        `<text align="center" bold="false" width="1" height="1">${dateStr}&#10;</text>` +
        `<text bold="true">Order #${orderNumber}&#10;</text>` +
        `<text bold="false"/>` +
        div +
        `<text align="left"/>` +
        itemLines +
        div +
        `<text>${pad('Subtotal', `$${subtotal.toFixed(2)}`)}&#10;</text>` +
        `<text>${pad(`Tax (${(TAX_RATE * 100).toFixed(2)}%)`, `$${tax.toFixed(2)}`)}&#10;</text>` +
        div +
        `<text bold="true">${pad('TOTAL', `$${total.toFixed(2)}`)}&#10;</text>` +
        `<text bold="false"/>` +
        `<feed line="2"/>` +
        `<text align="center" bold="true">Please show this when&#10;you pick up.&#10;</text>` +
        `<feed line="4"/>` +
        `<cut type="feed"/>`;

    ws.send(buildSOAP(xml));
}
