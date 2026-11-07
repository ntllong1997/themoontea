// The sticky header shared by the customer sites (/menu and /shop): the logo,
// and a pill per section. An `accent` link is drawn dark, for the one place
// the page most wants people to go next.
import Image from 'next/image';

// Full class names (not built from the breakpoint) so Tailwind can see them.
// Below the breakpoint the pills become one thumb-swipe row under the logo.
const BREAKPOINTS = {
    md: { inline: 'ml-auto hidden md:block', row: 'md:hidden' },
    xl: { inline: 'ml-auto hidden xl:block', row: 'xl:hidden' },
};

export default function SiteHeader({ nav, title = 'The Moon Tea', inlineFrom = 'md' }) {
    const layout = BREAKPOINTS[inlineFrom];
    return (
        <header className='sticky top-0 z-30 border-b border-moon-caramel/20 bg-moon-cream/95 backdrop-blur'>
            <div className='mx-auto flex max-w-6xl items-center gap-4 px-4 py-1.5 sm:px-6 md:py-2'>
                <a href='#top' className='flex shrink-0 items-center gap-2'>
                    <Image src='/menu/logo.jpg' alt='' width={30} height={46} className='h-9 w-auto mix-blend-multiply md:h-11' />
                    <span className='font-display text-lg md:text-xl'>{title}</span>
                </a>
                <nav aria-label='Menu sections' className={layout.inline}>
                    <ul className='flex gap-1 whitespace-nowrap text-sm font-semibold'>
                        {nav.map((link) => (
                            <li key={link.href}>
                                <a
                                    href={link.href}
                                    className={
                                        link.accent
                                            ? 'block rounded-full bg-moon-ink px-3 py-1.5 text-white transition hover:bg-moon-orange'
                                            : 'block rounded-full px-3 py-1.5 transition hover:bg-white'
                                    }
                                >
                                    {link.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>
            <nav
                aria-label='Menu sections'
                className={`overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${layout.row}`}
            >
                <ul className='flex w-max gap-2 px-4 pb-2 text-sm font-bold'>
                    {nav.map((link) => (
                        <li key={link.href}>
                            <a
                                href={link.href}
                                className={
                                    link.accent
                                        ? 'block rounded-full bg-moon-ink px-4 py-2 text-white active:bg-moon-orange'
                                        : 'block rounded-full bg-white px-4 py-2 ring-1 ring-moon-caramel/30 active:bg-moon-caramel active:text-white'
                                }
                            >
                                {link.label}
                            </a>
                        </li>
                    ))}
                </ul>
            </nav>
        </header>
    );
}
