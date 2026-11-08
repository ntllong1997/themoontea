'use client';

import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';

/**
 * The phone menu: a burger button that slides a list of the header's links
 * open below the header, and back closed.
 *
 * It closes when a link is tapped, on Escape (focus goes back to the button),
 * on a tap anywhere outside it, and if the screen widens past `minWidth`
 * (where the header shows its links inline instead). `className` hides it at
 * that same width, e.g. 'sm:hidden'.
 */
export default function MobileMenu({ nav, className = '', minWidth = 640 }) {
    const [open, setOpen] = useState(false);
    const root = useRef(null);
    const button = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => {
            if (event.key === 'Escape') {
                setOpen(false);
                button.current?.focus();
            }
        };
        const onPointer = (event) => {
            if (!root.current?.contains(event.target)) setOpen(false);
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('pointerdown', onPointer);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('pointerdown', onPointer);
        };
    }, [open]);

    useEffect(() => {
        const wide = window.matchMedia(`(min-width: ${minWidth}px)`);
        const onChange = (event) => event.matches && setOpen(false);
        wide.addEventListener('change', onChange);
        return () => wide.removeEventListener('change', onChange);
    }, [minWidth]);

    return (
        <div ref={root} className={`ml-auto ${className}`}>
            <button
                ref={button}
                type='button'
                aria-expanded={open}
                aria-controls='mobile-menu'
                aria-label='Menu'
                onClick={() => setOpen((value) => !value)}
                className='-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-moon-ink transition hover:bg-white active:bg-white'
            >
                {open ? <X aria-hidden className='h-6 w-6' /> : <Menu aria-hidden className='h-6 w-6' />}
            </button>
            {/* Positioned against the sticky header, so it drops over the page
                instead of pushing it down. Rows animate 0fr -> 1fr; visibility
                keeps the closed links out of the tab order and screen readers. */}
            <div
                id='mobile-menu'
                className={`absolute inset-x-0 top-full grid border-b border-moon-caramel/20 bg-moon-cream shadow-lg transition-[grid-template-rows,visibility] duration-200 ease-out ${
                    open ? 'visible grid-rows-[1fr]' : 'invisible grid-rows-[0fr]'
                }`}
            >
                <nav aria-label='Menu sections' className='overflow-hidden'>
                    <ul className='space-y-1 px-4 pb-4 pt-2'>
                        {nav.map((link) => (
                            <li key={link.href}>
                                <a
                                    href={link.href}
                                    onClick={() => setOpen(false)}
                                    className={
                                        link.accent
                                            ? 'mt-2 block rounded-full bg-moon-ink px-5 py-3 text-center text-lg font-bold text-white transition active:bg-moon-orange'
                                            : 'block rounded-2xl px-4 py-3 text-lg font-bold transition hover:bg-white active:bg-white'
                                    }
                                >
                                    {link.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>
        </div>
    );
}
