// Builds ePOS-Print XML (SOAP) documents for Epson network printers.
// The browser POSTs these straight to the printer's built-in HTTP service:
//   http://<printer-host>/cgi-bin/epos/service.cgi?devid=local_printer&timeout=<ms>
// Layout mirrors the ESC/POS receipt in print-server.js.

const W = 48; // characters per line (80 mm / 3⅛" paper at 203 DPI, Font A)

const EPOS_NAMESPACE = 'http://www.epson-pos.com/schemas/2011/03/epos-print';

function escapeXml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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

    if (current.length + 1 + priceStr.length <= W) {
        bodyLines.push(pad(current, priceStr));
    } else {
        bodyLines.push(current);
        bodyLines.push(' '.repeat(W - priceStr.length) + priceStr);
    }

    return bodyLines.join('\n') + '\n';
}

function textLine(content) {
    return `<text>${escapeXml(content)}</text>`;
}

function wrapSoap(eposBody) {
    return (
        '<?xml version="1.0" encoding="utf-8"?>' +
        '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
        '<s:Body>' +
        `<epos-print xmlns="${EPOS_NAMESPACE}">` +
        eposBody +
        '</epos-print>' +
        '</s:Body>' +
        '</s:Envelope>'
    );
}

// Empty print job — the printer replies with its status without printing.
export function buildStatusProbeXml() {
    return wrapSoap('');
}

export function buildTestXml() {
    return wrapSoap(
        '<text lang="en"/>' +
            '<text align="center"/>' +
            textLine('-- TEST PRINT --\n') +
            textLine('The Moon Tea\n') +
            '<feed line="3"/>' +
            '<cut type="feed"/>'
    );
}

export function buildReceiptXml({ orderNumber, items, taxRate, cashappUrl }) {
    const cashTag = cashappUrl.replace('https://cash.app/', '');
    const grouped = {};
    items.forEach(({ name, price }) => {
        if (!grouped[name]) grouped[name] = { name, price, qty: 0 };
        grouped[name].qty++;
    });

    const subtotal = items.reduce((sum, item) => sum + item.price, 0);
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

    const itemRows = Object.values(grouped)
        .map(({ name, price, qty }) => {
            const label = qty > 1 ? `${name} x${qty}` : name;
            const priceStr = `$${(price * qty).toFixed(2)}`;
            return textLine(formatItem(label, priceStr));
        })
        .join('');

    return wrapSoap(
        '<text lang="en"/>' +
            '<text smooth="true"/>' +

            // Header
            '<text align="center"/>' +
            '<text dw="true" dh="true" em="true"/>' +
            textLine('The Moon Tea\n') +
            '<text dw="false" dh="false" em="false"/>' +
            textLine(dateStr + '\n') +

            // Order number — double size, bold, left-aligned with spacing
            '<text align="left"/>' +
            textLine('\n') +
            '<text dw="true" dh="true" em="true"/>' +
            textLine(`Order #${orderNumber}\n`) +
            '<text dw="false" dh="false" em="false"/>' +
            textLine('\n') +
            textLine(divider) +

            // Items
            itemRows +

            // Totals
            textLine(divider) +
            '<text em="true"/>' +
            textLine(pad('Subtotal', `$${subtotal.toFixed(2)}`) + '\n') +
            '<text em="false"/>' +
            textLine(pad('Tax (8.25%)', `$${tax.toFixed(2)}`) + '\n') +
            textLine(divider) +
            '<text em="true"/>' +
            textLine(pad('TOTAL', `$${total.toFixed(2)}`) + '\n') +
            '<text em="false"/>' +

            // Footer
            '<feed line="1"/>' +
            '<text align="center"/>' +
            textLine('Please show this when\nyou pick up.\n') +

            // CashApp QR code
            '<feed line="1"/>' +
            '<text em="true"/>' +
            textLine('Pay with CashApp\n') +
            '<text em="false"/>' +
            `<symbol type="qrcode_model_2" level="level_m" width="4">${escapeXml(cashappUrl)}</symbol>` +
            textLine(cashTag + '\n') +

            '<feed line="2"/>' +
            '<cut type="feed"/>'
    );
}

// The printer answers with a SOAP envelope containing
// <response success="true|false" code="…" status="…"/>.
export function parseEposResponse(xmlText) {
    const successMatch = /<response[^>]*\bsuccess="(true|1)"/.exec(xmlText);
    const codeMatch = /<response[^>]*\bcode="([^"]*)"/.exec(xmlText);
    return {
        success: successMatch !== null,
        code: codeMatch ? codeMatch[1] : '',
    };
}
