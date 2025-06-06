export async function getOrderHistory() {
    const res = await fetch('/api/history');
    return res.json();
}

export async function saveOrderHistory(history) {
    await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(history),
    });
}
