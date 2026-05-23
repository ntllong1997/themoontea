import { loadStripeTerminal } from '@stripe/terminal-js';

let terminal = null;

async function fetchConnectionToken() {
    const res = await fetch('/api/stripe/connection-token', { method: 'POST' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.secret;
}

export async function getTerminal() {
    if (terminal) return terminal;
    const StripeTerminal = await loadStripeTerminal();
    terminal = StripeTerminal.create({
        onFetchConnectionToken:       fetchConnectionToken,
        onUnexpectedReaderDisconnect: () => { terminal = null; },
    });
    return terminal;
}

export async function discoverReaders() {
    const t = await getTerminal();
    const result = await t.discoverReaders({ simulated: false });
    if (result.error) throw new Error(result.error.message);
    return result.discoveredReaders;
}

export async function connectReader(reader) {
    const t = await getTerminal();
    const result = await t.connectReader(reader);
    if (result.error) throw new Error(result.error.message);
    return result.reader;
}

export async function disconnectReader() {
    if (!terminal) return;
    await terminal.disconnectReader();
}

export async function collectPayment(totalAmount) {
    const t = await getTerminal();

    // Create PaymentIntent on the server
    const piRes = await fetch('/api/stripe/payment-intent', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount: totalAmount }),
    });
    const { clientSecret, id, error: piError } = await piRes.json();
    if (piError) throw new Error(piError);

    // Collect payment method from the physical reader
    const collectResult = await t.collectPaymentMethod(clientSecret);
    if (collectResult.error) throw new Error(collectResult.error.message);

    // Process the payment
    const processResult = await t.processPayment(collectResult.paymentIntent);
    if (processResult.error) throw new Error(processResult.error.message);

    // Capture on the server
    const captureRes = await fetch('/api/stripe/capture', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ paymentIntentId: id }),
    });
    const captureData = await captureRes.json();
    if (captureData.error) throw new Error(captureData.error);

    return captureData;
}
