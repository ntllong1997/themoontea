// The public, customer-facing site: the menu and the pop-up calendar.
// Items and pop-up dates come from the database (managed at /admin/menu);
// how each category looks lives in lib/site/menu.js.
import Image from 'next/image';
import { buildSections } from '@/lib/site/menu';
import { getPublicMenuItems, getPublicPopups } from '@/lib/site/menuData';
import PopupCalendar, { NextPopupTeaser } from '@/components/site/PopupCalendar';

// Re-read the menu at most once a minute. Saving on /admin/menu refreshes it
// straight away (revalidatePath), so this is only a safety net.
export const revalidate = 60;

// The cups fanned out in the hero: these drinks if they're on the menu with a
// photo, topped up with any other drink photos.
const HERO_PREFERENCE = ['Matcha Brown Sugar', 'Brown Sugar Boba Tea', 'Golden Taro'];

function heroDrinks(sections) {
    const drinks = (sections.find((s) => s.id === 'boba')?.items ?? []).filter((item) => item.image && !item.soldOut);
    const preferred = HERO_PREFERENCE.map((name) => drinks.find((d) => d.name === name)).filter(Boolean);
    return [...preferred, ...drinks.filter((d) => !preferred.includes(d))].slice(0, 3);
}

const toppingLabel = (topping) => (topping === 'Nothing' ? 'No boba' : topping);

export default async function MenuPage() {
    const [items, popups] = await Promise.all([getPublicMenuItems(), getPublicPopups()]);
    const sections = buildSections(items);
    const nav = [
        ...sections.map((section) => ({ href: `#${section.id}`, label: section.navLabel ?? section.title })),
        { href: '#popups', label: 'Pop-ups' },
        { href: '/loyalty', label: 'Rewards' },
        { href: '/order/online', label: 'Order ahead' },
    ];
    return (
        <div className='bg-[radial-gradient(ellipse_at_top,_#FDF8F1_0%,_#F8EFE3_60%)]'>
            {/* First thing a keyboard or screen-reader user reaches. */}
            <a
                href={`#${sections[0]?.id ?? 'popups'}`}
                className='sr-only rounded-full bg-moon-ink px-4 py-2 font-bold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50'
            >
                Skip to the menu
            </a>
            <Header nav={nav} />
            <Hero drinks={heroDrinks(sections)} firstSectionId={sections[0]?.id ?? 'popups'} popups={popups} />
            {sections.map((section) =>
                section.choices ? (
                    <BuildYourOwnSection key={section.id} section={section} />
                ) : (
                    <ItemGridSection key={section.id} section={section} />
                )
            )}
            <section id='popups' className='scroll-mt-28 bg-moon-paper/70 py-10 sm:py-20 md:scroll-mt-20'>
                <div className='mx-auto max-w-6xl px-4 sm:px-6'>
                    <SectionHeading eyebrow='Come find us' title='Pop-up Calendar' />
                    <p className='mb-6 max-w-xl text-moon-muted sm:mb-8'>
                        We pop up at markets, festivals and events around town. Tap a highlighted day to see
                        where we&apos;ll be, then save it to your calendar.
                    </p>
                    <PopupCalendar popups={popups} />
                </div>
            </section>
            <Footer />
        </div>
    );
}

function Header({ nav }) {
    return (
        <header className='sticky top-0 z-30 border-b border-moon-caramel/20 bg-moon-cream/95 backdrop-blur'>
            <div className='mx-auto flex max-w-6xl items-center gap-4 px-4 py-1.5 sm:px-6 md:py-2'>
                <a href='#top' className='flex shrink-0 items-center gap-2'>
                    <Image src='/menu/logo.jpg' alt='' width={30} height={46} className='h-9 w-auto mix-blend-multiply md:h-11' />
                    <span className='font-display text-lg md:text-xl'>The Moon Tea</span>
                </a>
                <nav aria-label='Menu sections' className='ml-auto hidden md:block'>
                    <ul className='flex gap-1 whitespace-nowrap text-sm font-semibold'>
                        {nav.map((link) => (
                            <li key={link.href}>
                                <a
                                    href={link.href}
                                    className={
                                        link.href === '/order/online'
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
            {/* Phones: every section one thumb-swipe away. */}
            <nav aria-label='Menu sections' className='overflow-x-auto [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden'>
                <ul className='flex w-max gap-2 px-4 pb-2 text-sm font-bold'>
                    {nav.map((link) => (
                        <li key={link.href}>
                            <a
                                href={link.href}
                                className={
                                    link.href === '/order/online'
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

function Hero({ drinks, firstSectionId, popups }) {
    return (
        <section id='top' className='relative overflow-hidden'>
            <div className='mx-auto grid max-w-6xl items-center gap-6 px-4 pb-8 pt-6 sm:px-6 md:grid-cols-[1.1fr_1fr] md:gap-8 md:pb-20 md:pt-16'>
                <div>
                    <p className='font-script text-xl text-moon-orange sm:text-3xl'>Boba &amp; Bites</p>
                    <h1 className='mt-1 font-display text-5xl leading-[0.95] sm:text-7xl lg:text-8xl'>
                        The Moon
                        <br />
                        Tea
                    </h1>
                    <p className='mt-4 max-w-md text-moon-muted sm:mt-5 sm:text-lg'>
                        Handcrafted brown sugar boba, fresh fruit teas and cheesy Korean corndogs, made to order
                        at a pop-up near you.
                    </p>
                    <div className='mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:flex sm:flex-wrap sm:gap-3'>
                        <a
                            href={`#${firstSectionId}`}
                            className='rounded-full bg-moon-ink px-4 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:bg-moon-orange sm:px-6 sm:text-base'
                        >
                            See the menu
                        </a>
                        <a
                            href='#popups'
                            className='rounded-full bg-moon-caramel px-4 py-3 text-center text-sm font-bold text-moon-ink shadow-sm transition hover:bg-moon-orange hover:text-white sm:px-6 sm:text-base'
                        >
                            <span className='sm:hidden'>Next pop-up</span>
                            <span className='hidden sm:inline'>Find our next pop-up</span>
                        </a>
                    </div>
                    <div className='mt-4 sm:mt-5'>
                        <NextPopupTeaser popups={popups} />
                    </div>
                </div>
                <div className='relative mx-auto flex w-full max-w-[260px] items-end justify-center sm:max-w-md'>
                    <div className='absolute inset-x-6 bottom-0 top-10 rounded-[3rem] bg-moon-caramel/25' />
                    {drinks.map((item, i) => (
                        <div
                            key={item.name}
                            className={`relative isolate aspect-[5/8] overflow-hidden rounded-[2rem] bg-moon-paper shadow-md ring-1 ring-moon-caramel/20 ${i === 1 ? 'z-10 w-[40%]' : 'w-[32%]'} ${
                                i === 0 ? '-mr-6 rotate-[-6deg]' : i === 2 ? '-ml-6 rotate-[6deg]' : ''
                            }`}
                        >
                            <Image
                                src={item.image}
                                alt=''
                                fill
                                priority
                                sizes='(min-width: 768px) 200px, 110px'
                                className='object-contain p-1.5 mix-blend-multiply'
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
                <span className='block font-script text-2xl text-moon-orange sm:text-4xl'>{eyebrow}</span>
                <span className='font-display text-[2.1rem] sm:text-5xl'>{title}</span>
            </h2>
            {price && (
                <span className='mb-1 rounded-full bg-moon-caramel px-3 py-1 text-sm font-bold text-moon-ink'>
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

function SoldOut() {
    return (
        <span className='rounded-full bg-moon-ink px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white'>
            Sold out
        </span>
    );
}

function BuildYourOwnSection({ section }) {
    return (
        <section id={section.id} className='scroll-mt-28 py-10 sm:py-20 md:scroll-mt-20'>
            <div className='mx-auto max-w-6xl px-4 sm:px-6'>
                <SectionHeading eyebrow={section.eyebrow} title={section.title} price={section.price} />
                <p className='mb-6 max-w-xl text-moon-muted sm:mb-8'>{section.blurb}</p>
                <div className='grid gap-4 md:grid-cols-2 md:gap-6'>
                    <div className='space-y-4'>
                        {section.items.map((item) => (
                            <div
                                key={item.id}
                                className='overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-moon-caramel/20'
                            >
                                {item.image && (
                                    <div className={`relative aspect-[5/4] bg-moon-paper ${item.soldOut ? 'opacity-50 grayscale' : ''}`}>
                                        <Image
                                            src={item.image}
                                            alt={item.name}
                                            fill
                                            sizes='(min-width: 768px) 560px, 100vw'
                                            className='object-contain p-3 drop-shadow-md'
                                        />
                                    </div>
                                )}
                                <div className='space-y-2 p-4 sm:p-5'>
                                    <div className='flex flex-wrap items-center gap-2'>
                                        <h3 className='font-display text-xl sm:text-2xl'>{item.name}</h3>
                                        {item.price && <span className='font-bold text-moon-orange'>{item.price}</span>}
                                        {item.soldOut && <SoldOut />}
                                    </div>
                                    <p className='text-moon-muted'>{item.description}</p>
                                    <Tags tags={item.tags} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className='space-y-3 sm:space-y-4'>
                        {section.choices.map((choice, i) => (
                            <div key={choice.step} className='rounded-3xl bg-moon-caramel p-4 text-moon-ink shadow-sm sm:p-5'>
                                <p className='mb-3 flex items-center gap-3 font-display text-xl sm:text-2xl'>
                                    <span className='flex h-8 w-8 shrink-0 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-white font-body text-lg font-black text-moon-ink'>
                                        {i + 1}
                                    </span>
                                    {choice.step}
                                </p>
                                <ul className='grid gap-2'>
                                    {choice.options.map((option) => (
                                        <li key={option.name} className='flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-moon-ink shadow-[0_3px_0_#241810]'>
                                            {option.image && (
                                                <div className='relative h-9 w-20 shrink-0 sm:h-10 sm:w-24'>
                                                    <Image
                                                        src={option.image}
                                                        alt=''
                                                        fill
                                                        sizes='96px'
                                                        className='object-contain'
                                                    />
                                                </div>
                                            )}
                                            <div className='min-w-0'>
                                                <p className='font-extrabold sm:text-lg'>{option.name}</p>
                                                <p className='text-sm text-moon-muted'>{option.description}</p>
                                            </div>
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
        <section id={section.id} className='scroll-mt-28 py-10 sm:py-20 md:scroll-mt-20'>
            <div className='mx-auto max-w-6xl px-4 sm:px-6'>
                <SectionHeading eyebrow={section.eyebrow} title={section.title} price={section.price} />
                <p className='mb-6 max-w-xl text-moon-muted'>{section.blurb}</p>

                {section.toppings && (
                    <div className='mb-6 flex flex-wrap items-center gap-2 sm:mb-8'>
                        <span className='mr-1 w-full text-sm font-bold uppercase tracking-wide text-moon-muted sm:w-auto'>
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
                            ? 'grid gap-3 sm:grid-cols-2 sm:gap-5 md:grid-cols-3 lg:grid-cols-4'
                            : 'grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3'
                    }
                >
                    {section.items.map((item) =>
                        hasPhotos ? (
                            <PhotoCard key={item.id} item={item} section={section} />
                        ) : (
                            <CompactCard key={item.id} item={item} section={section} />
                        )
                    )}
                </ul>
            </div>
        </section>
    );
}

function PhotoCard({ item, section }) {
    return (
        <li className='group flex overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-moon-caramel/20 transition sm:flex-col sm:hover:-translate-y-1 sm:hover:shadow-md'>
            <div className={`relative aspect-[3/4] w-28 shrink-0 bg-moon-paper sm:aspect-[4/5] sm:w-auto ${item.soldOut ? 'opacity-50 grayscale' : ''}`}>
                {item.image ? (
                    <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        sizes='(min-width: 1024px) 270px, (min-width: 768px) 30vw, (min-width: 640px) 48vw, 112px'
                        className='object-contain p-2 mix-blend-multiply sm:p-3 transition duration-300 group-hover:scale-105'
                    />
                ) : (
                    <span className='absolute inset-0 flex items-center justify-center text-4xl sm:text-6xl'>
                        {section.emoji}
                    </span>
                )}
            </div>
            <div className='flex min-w-0 flex-1 flex-col gap-1.5 p-4'>
                <div className='flex items-start justify-between gap-2'>
                    <h3 className='text-lg font-extrabold leading-tight'>{item.name}</h3>
                    {item.price && <span className='shrink-0 font-bold text-moon-orange'>{item.price}</span>}
                </div>
                {item.soldOut && (
                    <div>
                        <SoldOut />
                    </div>
                )}
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
        <li className='flex gap-3 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-moon-caramel/20 sm:gap-4 sm:p-4'>
            <div className={`relative flex h-16 w-16 sm:h-20 sm:w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-moon-paper text-4xl ${item.soldOut ? 'opacity-50 grayscale' : ''}`}>
                {item.image ? (
                    <Image src={item.image} alt={item.name} fill sizes='80px' className='object-contain p-1 mix-blend-multiply' />
                ) : (
                    <span aria-hidden>{section.emoji}</span>
                )}
            </div>
            <div className='min-w-0 flex-1'>
                <div className='flex items-baseline justify-between gap-2'>
                    <h3 className='text-lg font-extrabold leading-tight'>{item.name}</h3>
                    {item.price && <span className='shrink-0 font-bold text-moon-orange'>{item.price}</span>}
                </div>
                {item.soldOut && (
                    <div className='mt-1'>
                        <SoldOut />
                    </div>
                )}
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
