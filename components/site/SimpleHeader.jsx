import Image from 'next/image';
import Link from 'next/link';

// The small header for customer pages other than the menu.
export default function SimpleHeader({ links = [] }) {
    return (
        <header className='border-b border-moon-caramel/20 bg-moon-cream/95'>
            <div className='mx-auto flex max-w-3xl items-center gap-3 px-4 py-2'>
                <Link href='/menu' className='flex shrink-0 items-center gap-2'>
                    <Image src='/menu/logo.jpg' alt='' width={30} height={46} className='h-9 w-auto mix-blend-multiply' />
                    <span className='font-display text-lg'>The Moon Tea</span>
                </Link>
                <nav aria-label='Site' className='ml-auto'>
                    <ul className='flex gap-1 text-sm font-bold'>
                        {links.map((link) => (
                            <li key={link.href}>
                                <Link href={link.href} className='block rounded-full px-3 py-2 hover:bg-white'>
                                    {link.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>
        </header>
    );
}
