// Drops answers to reads that started before this page's own latest write.
//
// The order page polls today's tickets and replaces its list with each
// answer. A poll that left just before a payment (or a new order) was saved
// can arrive just after, carrying the old state — the paid ticket would jump
// back to Tickets, or the new ticket would vanish and close its payment
// dialog, until the next poll. Each successful write calls `invalidate()`;
// a read keeps its answer only if no write finished since it `start()`ed.

/**
 * @returns {{ start: () => number, invalidate: () => void, isCurrent: (read: number) => boolean }}
 */
export function createStaleGuard() {
    let writes = 0;
    return {
        start: () => writes,
        invalidate: () => {
            writes += 1;
        },
        isCurrent: (read) => read === writes,
    };
}
