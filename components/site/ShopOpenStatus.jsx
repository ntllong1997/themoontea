'use client';

import { useEffect, useState } from 'react';
import { openStatus } from '@/lib/shop/info';

/**
 * "Open now · until 9 PM" / "Opens tomorrow at 11:30 AM", on the shop's
 * clock. The page is static, so this only fills in once it's in the browser,
 * then keeps itself current while the page stays open.
 */
export default function ShopOpenStatus({ info, href }) {
    const [status, setStatus] = useState(null);
    useEffect(() => {
        const update = () => setStatus(openStatus(info));
        update();
        const timer = setInterval(update, 60 * 1000);
        return () => clearInterval(timer);
    }, [info]);

    if (!status) return null;
    const Tag = href ? 'a' : 'span';
    return (
        <Tag
            href={href}
            className={`inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-moon-ink shadow-sm ring-1 ring-moon-caramel/30 ${
                href ? 'transition hover:bg-white' : ''
            }`}
        >
            <span
                aria-hidden
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.open ? 'bg-emerald-600' : 'bg-moon-muted'}`}
            />
            {status.label}
        </Tag>
    );
}
