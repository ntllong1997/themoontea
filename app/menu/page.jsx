// The public, customer-facing site: the menu and the pop-up calendar.
// Content lives in lib/site/menu.js and lib/site/popups.js — edit those, not
// this file, to add items or dates.
import Image from 'next/image';
import { MENU_SECTIONS } from '@/lib/site/menu';
import PopupCalendar, { NextPopupTeaser } from '@/components/site/PopupCalendar';

const NAV = [
    ...MENU_SECTIONS.map((section) => ({ href: `#${section.id}`, label: section.title })),
    { href: '#popups', label: 'Pop-ups' },
];

const toppingLabel = (topping) => (topping === 'Nothing' ? 'No boba' : topping);

export default function MenuPage() {
    return (
        <div className='bg-[radial-gradient(ellipse_at_top,_#FDF8F1_0%,_#F8EFE3_60%)]'>
            <Header />
            <Hero />
            {MENU_SECTIONS.map((section) =>
                section.choices ? (
                    <BuildYourOwnSection key={section.id} section={section} />
                ) : (
                    <ItemGridSection key={section.id} section={section} />
                )
            )}
            <section id='popups' className='scroll-mt-28 bg-moon-paper/70 py-16 sm:py-20'>
                <div className='mx-auto max-w-6xl px-4 sm:px-6'>
                    <SectionHeading eyebrow='Come find us' title='Pop-up Calendar' />
                    <p className='mb-8 max-w-xl text-moon-muted'>
                        We pop up at markets, festivals and events around town. Tap a highlighted day to see
                        where we&apos;ll be, then save it to your calendar.
                    </p>
                    <PopupCalendar />
                </div>
            </section>
            <Footer />
        </div>
    );
}

function Header() {
    return (
        <header className='sticky top-0 z-30 border-b border-moon-caramel/20 bg-moon-cream/90 backdrop-blur'>
            <div className='mx-auto flex max-w-6xl items-center gap-4 px-4 py-2 sm:px-6'>
                <a href='#top' className='flex shrink-0 items-center gap-2'>
                    <Image src='/menu/logo.jpg' alt='' width={30} height={46} className='h-11 w-auto mix-blend-multiply' />
                    <span className='font-display text-xl'>The Moon Tea</span>
                </a>
                <nav className='-mr-4 flex flex-1 justify-end overflow-x-auto pr-4 [scrollbar-width:none] sm:mr-0 sm:pr-0'>
                    <ul className='flex gap-1 whitespace-nowrap text-sm font-semibold'>
                        {NAV.map((link) => (
                            <li key={link.href}>
                                <a
                                    href={link.href}
                                    className={
                                        link.href === '#popups'
                                            ? 'block rounded-full bg-moon-ink px-3 py-1.5 text-white transition hover:bg-moon-orange'
                                            : 'hidden rounded-full px-3 py-1.5 transition hover:bg-white sm:block'
                                    }
                                >
                                    {link.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>
        </header>
    );
}

function Hero() {
    return (
        <section id='top' className='relative overflow-hidden'>
            <div className='mx-auto grid max-w-6xl items-center gap-8 px-4 pb-12 pt-10 sm:px-6 md:grid-cols-[1.1fr_1fr] md:pb-20 md:pt-16'>
                <div>
                    <p className='font-script text-2xl text-moon-orange sm:text-3xl'>Boba &amp; Bites</p>
                    <h1 className='mt-1 font-display text-6xl leading-[0.95] sm:text-7xl lg:text-8xl'>
                        The Moon
                        <br />
                        Tea
                    </h1>
                    <p className='mt-5 max-w-md text-lg text-moon-muted'>
                        Handcrafted brown sugar boba, fresh fruit teas and cheesy Korean corndogs, made to order
                        at a pop-up near you.
                    </p>
                    <div className='mt-6 flex flex-wrap gap-3'>
                        <a
                            href={`#${MENU_SECTIONS[0].id}`}
                            className='rounded-full bg-moon-ink px-6 py-3 font-bold text-white shadow-sm transition hover:bg-moon-orange'
                        >
                            See the menu
                        </a>
                        <a
                            href='#popups'
                            className='rounded-full bg-moon-caramel px-6 py-3 font-bold text-white shadow-sm transition hover:bg-moon-orange'
                        >
                            Find our next pop-up
                        </a>
                    </div>
                    <div className='mt-5'>
                        <NextPopupTeaser />
                    </div>
                </div>
                <div className='relative mx-auto flex w-full max-w-md items-end justify-center'>
                    <div className='absolute inset-x-6 bottom-0 top-10 rounded-[3rem] bg-moon-caramel/25' />
                    {['matcha-brown-sugar', 'brown-sugar-boba', 'golden-taro'].map((name, i) => (
                        <div
                            key={name}
                            className={`relative aspect-[5/8] ${i === 1 ? 'z-10 w-[40%]' : 'w-[32%] opacity-95'} ${
                                i === 0 ? '-mr-6 rotate-[-6deg]' : i === 2 ? '-ml-6 rotate-[6deg]' : ''
                            }`}
                        >
                            <Image
                                src={`/menu/${name}.jpg`}
                                alt=''
                                fill
                                priority
                                sizes='(min-width: 768px) 200px, 40vw'
                                className='rounded-[2rem] object-cover mix-blend-multiply'
                            />
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function SectionHeading({ eyebrow, title, price }) {
    return (
        <div className='mb-3 flex flex-wrap items-end gap-x-4 gap-y-1'>
            <h2 className='leading-none'>
                <span className='block font-script text-3xl text-moon-orange sm:text-4xl'>{eyebrow}</span>
                <span className='font-display text-4xl sm:text-5xl'>{title}</span>
            </h2>
            {price && (
                <span className='mb-1 rounded-full bg-moon-caramel px-3 py-1 text-sm font-bold text-white'>
                    {price} each
                </span>
            )}
        </div>
    );
}

function Tags({ tags }) {
    if (!tags?.length) return null;
    return (
        <div className='flex flex-wrap gap-1.5'>
            {tags.map((tag) => (
                <span key={tag} className='rounded-full bg-moon-orange/10 px-2.5 py-0.5 text-xs font-bold text-moon-orange'>
                    {tag}
                </span>
            ))}
        </div>
    );
}

function BuildYourOwnSection({ section }) {
    const [item] = section.items;
    return (
        <section id={section.id} className='scroll-mt-20 py-14 sm:py-20'>
            <div className='mx-auto max-w-6xl px-4 sm:px-6'>
                <SectionHeading eyebrow={section.eyebrow} title={section.title} price={section.price} />
                <p className='mb-8 max-w-xl text-moon-muted'>{section.blurb}</p>
                <div className='grid gap-6 md:grid-cols-2'>
                    <div className='overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-moon-caramel/20'>
                        {item.image && (
                            <div className='relative aspect-[4/3] bg-moon-paper'>
                                <Image
                                    src={item.image}
                                    alt={item.name}
                                    fill
                                    sizes='(min-width: 768px) 560px, 100vw'
                                    className='object-contain p-4 mix-blend-multiply'
                                />
                            </div>
                        )}
                        <div className='space-y-2 p-5'>
                            <h3 className='font-display text-2xl'>{item.name}</h3>
                            <p className='text-moon-muted'>{item.description}</p>
                            <Tags tags={item.tags} />
                        </div>
                    </div>
                    <div className='space-y-4'>
                        {section.choices.map((choice, i) => (
                            <div key={choice.step} className='rounded-3xl bg-moon-caramel p-5 text-white shadow-sm'>
                                <p className='mb-3 flex items-center gap-3 font-display text-2xl'>
                                    <span className='flex h-9 w-9 items-center justify-center rounded-full bg-white font-body text-lg font-black text-moon-caramel'>
                                        {i + 1}
                                    </span>
                                    {choice.step}
                                </p>
                                <ul className='grid gap-2'>
                                    {choice.options.map((option) => (
                                        <li key={option.name} className='rounded-2xl bg-white px-4 py-3 text-moon-ink shadow-[0_3px_0_#241810]'>
                                            <p className='text-lg font-extrabold'>{option.name}</p>
                                            <p className='text-sm text-moon-muted'>{option.description}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

function ItemGridSection({ section }) {
    const hasPhotos = section.items.some((item) => item.image);
    return (
        <section id={section.id} className='scroll-mt-20 py-14 sm:py-20'>
            <div className='mx-auto max-w-6xl px-4 sm:px-6'>
                <SectionHeading eyebrow={section.eyebrow} title={section.title} price={section.price} />
                <p className='mb-6 max-w-xl text-moon-muted'>{section.blurb}</p>

                {section.toppings && (
                    <div className='mb-8 flex flex-wrap items-center gap-2'>
                        <span className='mr-1 text-sm font-bold uppercase tracking-wide text-moon-muted'>
                            Choose your boba:
                        </span>
                        {section.toppings.map((topping) => (
                            <span
                                key={topping}
                                className='rounded-full bg-white px-3 py-1 text-sm font-semibold ring-1 ring-moon-caramel/40'
                            >
                                {toppingLabel(topping)}
                            </span>
                        ))}
                    </div>
                )}

                <ul
                    className={
                        hasPhotos
                            ? 'grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4'
                            : 'grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3'
                    }
                >
                    {section.items.map((item) =>
                        hasPhotos ? (
                            <PhotoCard key={item.name} item={item} section={section} />
                        ) : (
                            <CompactCard key={item.name} item={item} section={section} />
                        )
                    )}
                </ul>
            </div>
        </section>
    );
}

function PhotoCard({ item, section }) {
    return (
        <li className='group flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-moon-caramel/20 transition hover:-translate-y-1 hover:shadow-md'>
            <div className='relative aspect-[4/5] bg-moon-paper'>
                {item.image ? (
                    <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        sizes='(min-width: 1024px) 270px, (min-width: 768px) 30vw, 48vw'
                        className='object-contain p-3 mix-blend-multiply transition duration-300 group-hover:scale-105'
                    />
                ) : (
                    <span className='absolute inset-0 flex items-center justify-center text-6xl'>
                        {item.emoji ?? section.emoji}
                    </span>
                )}
            </div>
            <div className='flex flex-1 flex-col gap-1.5 p-3 sm:p-4'>
                <div className='flex items-start justify-between gap-2'>
                    <h3 className='font-extrabold leading-tight sm:text-lg'>{item.name}</h3>
                    {item.price && <span className='font-bold text-moon-orange'>{item.price}</span>}
                </div>
                <p className='text-sm leading-snug text-moon-muted'>{item.description}</p>
                <div className='mt-auto pt-1'>
                    <Tags tags={item.tags} />
                </div>
            </div>
        </li>
    );
}

function CompactCard({ item, section }) {
    return (
        <li className='flex gap-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-moon-caramel/20'>
            <div className='relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-moon-paper text-4xl'>
                {item.image ? (
                    <Image src={item.image} alt={item.name} fill sizes='80px' className='object-cover' />
                ) : (
                    <span aria-hidden>{item.emoji ?? section.emoji}</span>
                )}
            </div>
            <div className='min-w-0 flex-1'>
                <div className='flex items-baseline justify-between gap-2'>
                    <h3 className='text-lg font-extrabold leading-tight'>{item.name}</h3>
                    <span className='shrink-0 font-bold text-moon-orange'>
                        {item.priceNote && <span className='mr-1 text-xs font-semibold text-moon-muted'>{item.priceNote}</span>}
                        {item.price}
                    </span>
                </div>
                <p className='mt-1 text-sm leading-snug text-moon-muted'>{item.description}</p>
                <div className='mt-2'>
                    <Tags tags={item.tags} />
                </div>
            </div>
        </li>
    );
}

function Footer() {
    return (
        <footer className='bg-moon-ink py-10 text-moon-cream'>
            <div className='mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center sm:px-6'>
                <p className='font-display text-2xl'>The Moon Tea</p>
                <p className='font-script text-lg text-moon-caramel'>Boba &amp; Bites</p>
                <p className='text-sm text-moon-cream/70'>
                    Prices and availability may vary by pop-up. Every item is made fresh to order.
                </p>
            </div>
        </footer>
    );
}
