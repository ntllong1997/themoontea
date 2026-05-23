// Local print server — runs alongside the Next.js app.
// Start with: npm run print-server
// Listens on http://localhost:3001 and sends ESC/POS to the USB thermal printer.

const { SerialPort } = require('serialport');
const http = require('http');

// ── CONFIG ────────────────────────────────────────────────────────────────────
// Set PRINTER_PORT to the COM port shown in Device Manager → Ports (COM & LPT)
// when the printer is plugged in via USB.
const COM_PORT    = process.env.PRINTER_PORT           || 'COM9';          // ← change this
const BAUD_RATE   = parseInt(process.env.PRINTER_BAUD  || '9600', 10);
const SERVER_PORT = parseInt(process.env.PRINT_SERVER_PORT || '3333', 10);
const CASHAPP_URL = process.env.CASHAPP_URL            || 'https://cash.app/$TheMoonTea';
// ─────────────────────────────────────────────────────────────────────────────

const ESC = 0x1b;
const GS = 0x1d;
const W = 48; // characters per line (80 mm / 3⅛" paper at 203 DPI)

let serialPort = null;

// ESC/POS QR code — model 2, error correction M, module size 4 (~1.5 cm)
function buildQRCode(data) {
    const bytes  = Buffer.from(data, 'utf8');
    const len    = bytes.length + 3;             // fn(1) + m(1) + data
    const pL     = len & 0xFF;
    const pH     = (len >> 8) & 0xFF;
    return Buffer.concat([
        Buffer.from([0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]), // model 2
        Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x04]),        // size 4
        Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31]),        // error correction M
        Buffer.from([0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]),            // store data
        bytes,
        Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]),        // print
    ]);
}

// Right-align `right` against `left` on a single line.
function pad(left, right) {
    return (
        left + ' '.repeat(Math.max(1, W - left.length - right.length)) + right
    );
}

// Format one item row. If the label is too long to share a line with the price,
// wrap the label at word boundaries and right-align the price on the last line.
function formatItem(label, priceStr) {
    if (label.length + 1 + priceStr.length <= W) {
        return pad(label, priceStr) + '\n';
    }

    const words = label.split(' ');
    const bodyLines = [];
    let current = '';

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= W) {
            current = candidate;
        } else {
            if (current) bodyLines.push(current);
            current = word;
        }
    }

    // Fit remaining text + price on one line if possible, otherwise separate lines.
    if (current.length + 1 + priceStr.length <= W) {
        bodyLines.push(pad(current, priceStr));
    } else {
        bodyLines.push(current);
        bodyLines.push(' '.repeat(W - priceStr.length) + priceStr);
    }

    return bodyLines.join('\n') + '\n';
}

function buildReceipt({ orderNumber, items, taxRate, cashappUrl, paymentUrl }) {
    const cashApp = cashappUrl || CASHAPP_URL;
    const cashTag = cashApp.replace('https://cash.app/', '');
    const grouped = {};
    items.forEach(({ name, price }) => {
        if (!grouped[name]) grouped[name] = { name, price, qty: 0 };
        grouped[name].qty++;
    });

    const subtotal = items.reduce((s, i) => s + i.price, 0);
    const tax = subtotal * taxRate;
    const total = subtotal + tax;
    const dateStr = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });

    const divider = '-'.repeat(W) + '\n';

    const chunks = [
        Buffer.from([ESC, 0x40]),

        // Header
        Buffer.from([ESC, 0x61, 0x01]), // center
        Buffer.from([GS, 0x21, 0x11]), // double size
        Buffer.from([ESC, 0x45, 0x01]), // bold
        Buffer.from('The Moon Tea\n'),
        Buffer.from([GS, 0x21, 0x00]), // normal size
        Buffer.from([ESC, 0x45, 0x00]), // bold off
        Buffer.from(dateStr + '\n'),

        // Order number — double size, bold, left-aligned with spacing
        Buffer.from([ESC, 0x61, 0x00]), // left
        Buffer.from('\n'), // margin above
        Buffer.from([GS, 0x21, 0x11]), // double width + height
        Buffer.from([ESC, 0x45, 0x01]), // bold
        Buffer.from(`Order #${orderNumber}\n`),
        Buffer.from([GS, 0x21, 0x00]), // normal size
        Buffer.from([ESC, 0x45, 0x00]), // bold off
        Buffer.from('\n'), // margin below
        Buffer.from(divider),

        // Items
        ...Object.values(grouped).map(({ name, price, qty }) => {
            const label = qty > 1 ? `${name} x${qty}` : name;
            const priceStr = `$${(price * qty).toFixed(2)}`;
            return Buffer.from(formatItem(label, priceStr));
        }),

        // Totals
        Buffer.from(divider),
        Buffer.from([ESC, 0x45, 0x01]), // bold
        Buffer.from(pad('Subtotal', `$${subtotal.toFixed(2)}`) + '\n'),
        Buffer.from([ESC, 0x45, 0x00]), // bold off

        Buffer.from(pad('Tax (8.25%)', `$${tax.toFixed(2)}`) + '\n'),
        Buffer.from(divider),
        Buffer.from([ESC, 0x45, 0x01]), // bold
        Buffer.from(pad('TOTAL', `$${total.toFixed(2)}`) + '\n'),
        Buffer.from([ESC, 0x45, 0x00]), // bold off

        // Footer
        Buffer.from('\n'),
        Buffer.from([ESC, 0x61, 0x01]),          // center
        Buffer.from('Please show this when\nyou pick up.\n'),

        // Payment QR — Stripe link if provided, otherwise CashApp
        Buffer.from('\n'),
        Buffer.from([ESC, 0x45, 0x01]),          // bold
        Buffer.from(paymentUrl ? 'Scan to Pay\n' : 'Pay with CashApp\n'),
        Buffer.from([ESC, 0x45, 0x00]),          // bold off
        buildQRCode(paymentUrl || cashApp),
        Buffer.from((paymentUrl ? 'Powered by Stripe' : cashTag) + '\n'),

        Buffer.from('\n\n'),
        Buffer.from([GS, 0x56, 0x42, 0x04]),     // cut
    ];

    return Buffer.concat(chunks);
}

function connectSerial() {
    const sp = new SerialPort({
        path: COM_PORT,
        baudRate: BAUD_RATE,
        autoOpen: true,
    });

    sp.on('open', () => {
        serialPort = sp;
        console.log(`[printer] Connected to ${COM_PORT} at ${BAUD_RATE} baud`);
    });

    sp.on('error', (err) => {
        console.error(`[printer] Error: ${err.message}`);
        serialPort = null;
        setTimeout(connectSerial, 5000);
    });

    sp.on('close', () => {
        serialPort = null;
        console.log('[printer] Disconnected — retrying in 5 s…');
        setTimeout(connectSerial, 5000);
    });
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'GET' && req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
            JSON.stringify({ ready: serialPort !== null && serialPort.isOpen }),
        );
        return;
    }

    if (req.method === 'GET' && req.url === '/test') {
        if (!serialPort || !serialPort.isOpen) {
            res.writeHead(503, { 'Content-Type': 'text/plain' });
            res.end('Printer not connected');
            return;
        }
        const testData = Buffer.concat([
            Buffer.from([0x1b, 0x40]),
            Buffer.from([0x1b, 0x61, 0x01]),
            Buffer.from('-- TEST PRINT --\n'),
            Buffer.from('The Moon Tea\n'),
            Buffer.from([0x1b, 0x61, 0x00]),
            Buffer.from('\n\n\n\n'),
            Buffer.from([0x1d, 0x56, 0x42, 0x04]),
        ]);
        // Respond immediately — don't wait for drain (printer may not acknowledge)
        serialPort.write(testData);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(
            'Test bytes sent to ' + COM_PORT + '. Check if printer printed.',
        );
        return;
    }

    if (req.method === 'POST' && req.url === '/print') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            if (!serialPort || !serialPort.isOpen) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Printer not connected' }));
                return;
            }
            try {
                const data = JSON.parse(body);
                const receipt = buildReceipt(data);
                console.log(
                    `[print] Order #${data.orderNumber} — ${receipt.length} bytes`,
                );
                serialPort.write(receipt, (writeErr) => {
                    if (writeErr) {
                        console.error('[print] Write error:', writeErr.message);
                        res.writeHead(500, {
                            'Content-Type': 'application/json',
                        });
                        res.end(JSON.stringify({ error: writeErr.message }));
                        return;
                    }
                    console.log('[print] Done');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true }));
                });
            } catch (err) {
                console.error('[print] Parse error:', err.message);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end();
});

connectSerial();

server.listen(SERVER_PORT, () => {
    console.log(`[print-server] Listening on http://localhost:${SERVER_PORT}`);
    console.log(`[print-server] COM port: ${COM_PORT}  Baud: ${BAUD_RATE}`);
});
