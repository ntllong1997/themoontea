'use client';

// An accessible modal for the admin editors: announced as a dialog with its
// title, focus moves in when it opens and back to whatever opened it when it
// closes, Tab stays inside it, and Escape or a tap on the backdrop closes it.

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Dialog({ title, onClose, onSubmit, children }) {
    const titleId = useId();
    const panel = useRef(null);
    // Keep the latest onClose without re-running the open/close effect.
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    useEffect(() => {
        const opener = document.activeElement;
        const node = panel.current;
        // Start on the first field, so typing can begin straight away.
        const first = node?.querySelector('input:not([type="file"]):not([type="hidden"]), select, textarea');
        (first ?? node)?.focus();

        const onKey = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeRef.current();
                return;
            }
            if (event.key !== 'Tab' || !node) return;
            const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
            if (items.length === 0) return;
            const [firstItem, lastItem] = [items[0], items[items.length - 1]];
            if (event.shiftKey && document.activeElement === firstItem) {
                event.preventDefault();
                lastItem.focus();
            } else if (!event.shiftKey && document.activeElement === lastItem) {
                event.preventDefault();
                firstItem.focus();
            }
        };
        document.addEventListener('keydown', onKey);
        // The page behind shouldn't scroll while the dialog is open.
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = overflow;
            if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
        };
    }, []);

    return (
        <div className='fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-6' onClick={onClose}>
            <div
                ref={panel}
                role='dialog'
                aria-modal='true'
                aria-labelledby={titleId}
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
                className='max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl outline-none sm:rounded-3xl'
            >
                <form onSubmit={onSubmit}>
                    <div className='mb-4 flex items-center justify-between'>
                        <h2 id={titleId} className='text-lg font-bold'>
                            {title}
                        </h2>
                        <button type='button' onClick={onClose} aria-label='Close' className='rounded-full p-2 hover:bg-gray-100'>
                            <X className='h-5 w-5' aria-hidden />
                        </button>
                    </div>
                    {children}
                </form>
            </div>
        </div>
    );
}
