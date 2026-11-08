// The main shop's customer site: the full shop menu, and where and when to
// find the shop. Items come from lib/shop/menu.json (transcribed from the
// printed menu boards), the address and hours from lib/shop/info.json; this
// file only decides how they look. It shares the pop-up site's look (/menu) and
// sends people there for pop-up dates.
import Image from 'next/image';
import { Clock, MapPin, Phone } from 'lucide-react';
import info from '@/lib/shop/info.json';
import menu from '@/lib/shop/menu.json';
import { fullAddress, hoursRows, mapsUrl, openEveryDay, structuredData, telHref } from '@/lib/shop/info';
import { drinkCount, groupItems, shopSections } from '@/lib/shop/menu';
import { getPublicPopups } from '@/lib/site/menuData';
import { NextPopupTeaser } from '@/components/site/PopupCalendar';
import SectionHeading from '@/components/site/SectionHeading';
import ShopOpenStatus from '@/components/site/ShopOpenStatus';
import SiteHeader from '@/components/site/SiteHeader';

// The menu is in the code; this only keeps the "next pop-up" line fresh.
export const revalidate = 60;

const POPUPS_HREF = '/menu#popups';

// How each category reads on the page. A category with no entry here still
// shows, under its own name.
const COPY = {
    'milk-tea': {
        eyebrow: 'Creamy',
        blurb: 'From our signature The Moon Tea to taro, matcha, Thai tea and cheesy favorites.',
    },
    'fruit-tea': { eyebrow: 'Fruity', blurb: 'Signature fruit tea blends, or keep it simple with a classic.' },
    smoothie: { eyebrow: 'Blended', title: 'Smoothies', blurb: 'Thick and icy, from Nutella Banana to Mangonada.' },
    coffee: { eyebrow: 'Wake up', blurb: 'Creme brulee, Vietnamese, ube, coco and more.' },
    matcha: { eyebrow: 'Go green', blurb: 'Cheese foam, floral, mango, taro and more.' },
    toppings: {
        eyebrow: 'Make it yours',
        title: 'Sugar, Ice & Toppings',
        blurb: 'Every drink is made your way. Pick your sugar and ice level, then add toppings.',
    },
    'korean-corndog': {
        eyebrow: 'Korean',
        title: 'Corndogs',
        blurb: 'Golden and crunchy outside. Build yours in two steps.',
    },
    'buldak-elote': {
        eyebrow: 'Spicy',
        blurb: 'Carbonara Buldak noodles with corn, nacho cheese, cotija cheese and Hot Cheeto.',
    },
    sides: { eyebrow: 'To share', blurb: 'Crispy, crunchy and made for sharing.' },
};

const withCopy = (section) => {
    const copy = COPY[section.id] ?? {};
    return {
        ...section,
        eyebrow: copy.eyebrow ?? 'More',
        title: copy.title ?? section.name,
        blurb: copy.blurb ?? '',
    };
};

// The cups fanned out in the hero (the middle one is drawn biggest).
const HERO = ['matcha-strawberry', 'the-moon-tea', 'taro-ube'];

function heroDrinks(drinks) {
    const photos = drinks.flatMap((section) => section.items).filter((item) => item.image);
    const chosen = HERO.map((id) => photos.find((item) => item.id === id)).filter(Boolean);
    return chosen.length === HERO.length ? chosen : photos.slice(0, 3);
}

// Sugar and ice dots, from "No Added" to "Extra", as on the menu board.
const LEVEL_COLORS = ['#F6DF8E', '#EBC544', '#D79E57', '#A86F4C'];

// Sticky header height, so a tapped section isn't hidden under it.
const SCROLL_MARGIN = 'scroll-mt-28 sm:scroll-mt-20';

export default async function ShopPage() {
    const popups = await getPublicPopups();
    const sections = shopSections(menu).map(withCopy);
    const drinks = sections.filter((s) => s.kind === 'drink');
    const toppings = sections.find((s) => s.kind === 'topping');
    const food = sections.filter((s) => s.kind !== 'drink' && s.kind !== 'topping');
    // Just the big stops; each part of the menu is a scroll away from there.
    const nav = [
        drinks.length > 0 && { href: '#drinks', label: 'Drinks' },
        food.length > 0 && { href: '#food', label: 'Food' },
        { href: POPUPS_HREF, label: 'Pop-ups' },
        { href: '#visit', label: 'Visit', accent: true },
    ].filter(Boolean);
    return (
        <div className='bg-[radial-gradient(ellipse_at_top,_#FDF8F1_0%,_#F8EFE3_60%)]'>
            <script
                type='application/ld+json'
                // Our own data, but escape '<' so nothing in it can close the tag.
                dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(info)).replace(/</g, '\\u003c') }}
            />
            {/* First thing a keyboard or screen-reader user reaches. */}
            <a
                href={drinks.length ? '#drinks' : '#visit'}
                className='sr-only rounded-full bg-moon-ink px-4 py-2 font-bold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50'
            >
                Skip to the menu
            </a>
            <SiteHeader nav={nav} inlineFrom='sm' spread />
            <Hero drinks={heroDrinks(drinks)} count={drinkCount(menu)} hasDrinks={drinks.length > 0} hasFood={food.length > 0} />

            {/* Big sections span the row; on wide screens small ones (coffee, matcha) pair up side by side. */}
            <div id='drinks' className={`${SCROLL_MARGIN} mx-auto grid max-w-6xl gap-x-10 px-4 sm:px-6 lg:grid-cols-2`}>
                {drinks.map((section) => (
                    <DrinkSection key={section.id} section={section} />
                ))}
            </div>

            {toppings && <CustomizeSection section={toppings} options={menu.drinkOptions ?? []} />}

            <div id='food' className={SCROLL_MARGIN}>
                {food.map((section) =>
                    section.groups.some((group) => group.name) ? (
                        <BuildSection key={section.id} section={section} />
                    ) : section.items.length === 1 ? (
                        <FeatureSection key={section.id} section={section} />
                    ) : (
                        <FoodGridSection key={section.id} section={section} />
                    )
                )}
            </div>

            <VisitSection />
            <PopupBand popups={popups} />
            <Footer />
        </div>
    );
}

function Hero({ drinks, count, hasDrinks, hasFood }) {
    return (
        <section id='top' className='relative overflow-hidden'>
            <div className='mx-auto grid max-w-6xl items-center gap-6 px-4 pb-8 pt-6 sm:px-6 md:grid-cols-[1.1fr_1fr] md:gap-8 md:pb-16 md:pt-16'>
                <div>
                    <p className='font-script text-xl text-moon-orange sm:text-3xl'>{menu.tagline}</p>
                    <h1 className='mt-1 font-display text-5xl leading-[0.95] sm:text-7xl lg:text-8xl'>
                        The Moon
                        <br />
                        Tea
                    </h1>
                    <p className='mt-4 max-w-md text-moon-muted sm:mt-5 sm:text-lg'>
                        Our full shop menu: {count} drinks across milk tea, fruit tea, smoothies, coffee and matcha,
                        plus Korean corndogs, Buldak elote and crispy sides.
                    </p>
                    <div className='mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:flex sm:flex-wrap sm:gap-3'>
                        {hasDrinks && (
                            <a
                                href='#drinks'
                                className='rounded-full bg-moon-ink px-4 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:bg-moon-orange sm:px-6 sm:text-base'
                            >
                                See the drinks
                            </a>
                        )}
                        {hasFood && (
                            <a
                                href='#food'
                                className='rounded-full bg-moon-caramel px-4 py-3 text-center text-sm font-bold text-moon-ink shadow-sm transition hover:bg-moon-orange hover:text-white sm:px-6 sm:text-base'
                            >
                                See the food
                            </a>
                        )}
                    </div>
                    <div className='mt-4 flex flex-wrap gap-2 sm:mt-5'>
                        <ShopOpenStatus info={info} href='#visit' />
                        <a
                            href='#visit'
                            className='inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-moon-ink shadow-sm ring-1 ring-moon-caramel/30 transition hover:bg-white'
                        >
                            <MapPin aria-hidden className='h-4 w-4 shrink-0 text-moon-orange' />
                            <span>
                                {info.address.street}
                                <span className='hidden sm:inline'>, {info.address.city}</span>
                            </span>
                        </a>
                    </div>
                </div>
                <div className='relative mx-auto flex w-full max-w-[260px] items-end justify-center sm:max-w-md'>
                    <div className='absolute inset-x-6 bottom-0 top-10 rounded-[3rem] bg-moon-caramel/25' />
                    {drinks.map((item, i) => (
                        <div
                            key={item.id}
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
                                className='object-contain p-2 mix-blend-multiply'
                            />
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function DrinkSection({ section }) {
    const photos = section.items.filter((item) => item.image);
    const extras = groupItems(section.items.filter((item) => !item.image));
    // A few photos sit beside their list (or above it, when the section only
    // has half the row on a wide screen); a long grid takes the full row.
    const small = photos.length <= 3;
    const tiles = photos.map((item) =>
        item.signature ? (
            <SignatureTile key={item.id} item={item} />
        ) : (
            <DrinkTile
                key={item.id}
                item={item}
                sizes={
                    small
                        ? '(min-width: 640px) 144px, 32vw'
                        : '(min-width: 1024px) 150px, (min-width: 768px) 20vw, (min-width: 640px) 25vw, 32vw'
                }
            />
        )
    );
    const lists = extras.map((group) => (
        <MoreList
            key={group.name ?? 'more'}
            title={group.name ? `${group.name} ${section.name.toLowerCase()}s` : `More ${section.name.toLowerCase()}`}
            items={group.items}
        />
    ));
    return (
        <section id={section.id} className={`${SCROLL_MARGIN} py-8 sm:py-12 ${small ? '' : 'lg:col-span-2'}`}>
            <SectionHeading eyebrow={section.eyebrow} title={section.title} price={section.price} />
            {section.blurb && <p className='mb-5 max-w-xl text-moon-muted sm:mb-6'>{section.blurb}</p>}
            {small ? (
                <div className='grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:gap-4 lg:grid-cols-1'>
                    <ul className='grid grid-cols-3 gap-2.5 sm:grid-cols-[repeat(2,9rem)] sm:gap-4'>{tiles}</ul>
                    <div className='space-y-3'>{lists}</div>
                </div>
            ) : (
                <>
                    <ul className='grid grid-flow-dense grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-4 md:grid-cols-5 lg:grid-cols-7'>
                        {tiles}
                    </ul>
                    {lists.length > 0 && <div className='mt-4 space-y-3'>{lists}</div>}
                </>
            )}
        </section>
    );
}

function DrinkTile({ item, sizes }) {
    return (
        <li className='group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-moon-caramel/20 transition sm:rounded-3xl sm:hover:-translate-y-1 sm:hover:shadow-md'>
            <div className='relative aspect-[3/4] bg-moon-paper'>
                <Image
                    src={item.image}
                    alt=''
                    fill
                    sizes={sizes}
                    className='object-contain p-2 mix-blend-multiply transition duration-300 group-hover:scale-105'
                />
            </div>
            <div className='flex flex-1 flex-col items-center justify-center gap-0.5 px-1.5 py-2 text-center sm:px-2 sm:py-3'>
                <h3 className='hyphens-auto break-words text-xs font-extrabold uppercase leading-tight tracking-wide sm:text-sm'>
                    {item.name}
                </h3>
                {item.description && <p className='text-xs leading-snug text-moon-muted'>{item.description}</p>}
                {item.price && <p className='text-sm font-bold text-moon-orange'>{item.price}</p>}
            </div>
        </li>
    );
}

function SignatureTile({ item }) {
    return (
        <li className='group col-span-2 row-span-2 flex flex-col overflow-hidden rounded-2xl bg-moon-caramel/30 shadow-sm ring-1 ring-moon-caramel/40 sm:rounded-3xl'>
            <div className='relative min-h-[14rem] flex-1'>
                <Image
                    src={item.image}
                    alt=''
                    fill
                    sizes='(min-width: 1024px) 300px, (min-width: 640px) 50vw, 64vw'
                    className='object-contain p-3 mix-blend-multiply transition duration-300 group-hover:scale-105'
                />
            </div>
            <div className='flex flex-wrap items-center justify-between gap-x-2 gap-y-1 bg-white px-3 py-2.5 sm:px-4 sm:py-3'>
                <h3 className='font-display text-xl sm:text-2xl'>{item.name}</h3>
                <span className='rounded-full bg-moon-ink px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white'>
                    Signature
                </span>
                {item.description && <p className='w-full text-sm text-moon-muted'>{item.description}</p>}
                {item.price && <p className='w-full font-bold text-moon-orange'>{item.price}</p>}
            </div>
        </li>
    );
}

/** The drinks the board lists by name only, without a photo. */
function MoreList({ title, items }) {
    return (
        <div className='rounded-3xl bg-white p-4 shadow-sm ring-1 ring-moon-caramel/20 sm:p-5'>
            <h3 className='mb-3 font-display text-xl sm:text-2xl'>{title}</h3>
            <ul className='flex flex-wrap gap-2'>
                {items.map((item) => (
                    <li key={item.id} className='rounded-full bg-moon-cream px-3.5 py-1.5 text-sm font-bold ring-1 ring-moon-caramel/30'>
                        {item.name}
                        {item.price && <span className='ml-1.5 text-moon-orange'>{item.price}</span>}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function CustomizeSection({ section, options }) {
    return (
        <section id={section.id} className={`${SCROLL_MARGIN} bg-moon-paper/70 py-10 sm:py-16`}>
            <div className='mx-auto max-w-6xl px-4 sm:px-6'>
                <SectionHeading eyebrow={section.eyebrow} title={section.title} />
                <p className='mb-6 max-w-xl text-moon-muted sm:mb-8'>{section.blurb}</p>
                <div className={`grid gap-4 md:gap-6 ${options.length ? 'lg:grid-cols-[2fr_3fr]' : ''}`}>
                    {options.length > 0 && (
                        <div className='space-y-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-moon-caramel/20 sm:p-5'>
                            {options.map((option) => (
                                <div key={option.name}>
                                    <h3 className='mb-2 font-display text-xl sm:text-2xl'>{option.name}</h3>
                                    <ol className='grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2'>
                                        {option.choices.map((choice, i) => (
                                            <li
                                                key={choice}
                                                className='flex items-center gap-2 whitespace-nowrap rounded-full bg-moon-cream px-3 py-2 text-sm font-bold ring-1 ring-moon-caramel/30'
                                            >
                                                <span
                                                    aria-hidden
                                                    className='h-3 w-3 shrink-0 rounded-full ring-1 ring-moon-ink/20'
                                                    style={{ backgroundColor: LEVEL_COLORS[i % LEVEL_COLORS.length] }}
                                                />
                                                {choice}
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className='rounded-3xl bg-moon-caramel p-4 text-moon-ink shadow-sm sm:p-5'>
                        <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
                            <h3 className='font-display text-xl sm:text-2xl'>{section.name}</h3>
                            {section.price && (
                                <span className='rounded-full bg-white px-3 py-1 text-sm font-black'>{section.price} each</span>
                            )}
                        </div>
                        <ul className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
                            {section.items.map((item) => (
                                <li key={item.id} className='rounded-2xl bg-white px-3 py-2 text-sm font-bold shadow-[0_3px_0_#241810]'>
                                    {item.name}
                                    {item.price && <span className='ml-1 text-moon-orange'>{item.price}</span>}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </section>
    );
}

/** Build-your-own (the corndog): one numbered step per group. */
function BuildSection({ section }) {
    return (
        <section id={section.id} className={`${SCROLL_MARGIN} py-10 sm:py-16`}>
            <div className='mx-auto max-w-6xl px-4 sm:px-6'>
                <SectionHeading eyebrow={section.eyebrow} title={section.title} price={section.price} />
                <p className='mb-6 max-w-xl text-moon-muted sm:mb-8'>{section.blurb}</p>
                <div className='grid gap-4 lg:grid-cols-[1fr_2fr] lg:gap-6'>
                    {section.groups.map((group, i) => (
                        <div key={group.name ?? i} className='rounded-3xl bg-moon-caramel p-4 text-moon-ink shadow-sm sm:p-5'>
                            <h3 className='mb-3 flex items-center gap-3 font-display text-xl sm:text-2xl'>
                                <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white font-body text-lg font-black sm:h-9 sm:w-9'>
                                    {i + 1}
                                </span>
                                {group.name ? `Choose the ${group.name.toLowerCase()}` : 'Choose'}
                            </h3>
                            <ul className={`grid grid-cols-3 gap-2 sm:gap-3 ${group.items.length > 3 ? 'sm:grid-cols-6' : ''}`}>
                                {group.items.map((item) => (
                                    <li key={item.id} className='flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_3px_0_#241810]'>
                                        {item.image && (
                                            <div className='relative aspect-[1/2]'>
                                                <Image
                                                    src={item.image}
                                                    alt=''
                                                    fill
                                                    sizes='(min-width: 640px) 120px, 30vw'
                                                    className='object-contain p-2'
                                                />
                                            </div>
                                        )}
                                        <p className='px-1 py-2 text-center text-xs font-extrabold uppercase leading-tight sm:text-sm'>
                                            {item.name}
                                            {item.price && <span className='block text-moon-orange'>{item.price}</span>}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

/** A category that is one dish (Buldak elote): one big card. */
function FeatureSection({ section }) {
    const [item] = section.items;
    return (
        <section id={section.id} className={`${SCROLL_MARGIN} py-10 sm:py-16`}>
            <div className='mx-auto max-w-6xl px-4 sm:px-6'>
                <div className='grid items-center gap-4 overflow-hidden rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-moon-caramel/20 sm:p-6 md:grid-cols-2 md:gap-8 md:p-10'>
                    {item.image && (
                        <div className='relative mx-auto aspect-square w-full max-w-md'>
                            <Image src={item.image} alt='' fill sizes='(min-width: 768px) 450px, 90vw' className='object-contain' />
                        </div>
                    )}
                    <div>
                        <SectionHeading eyebrow={section.eyebrow} title={section.title} />
                        {item.price && <p className='mb-3 text-xl font-bold text-moon-orange'>{item.price}</p>}
                        <p className='mb-5 max-w-md text-moon-muted'>{section.blurb}</p>
                        {item.description && <p className='mb-5 max-w-md text-moon-muted'>{item.description}</p>}
                        {item.ingredients?.length > 0 && (
                            <>
                                <h3 className='mb-2 text-sm font-bold uppercase tracking-wide text-moon-muted'>What&apos;s in it</h3>
                                <ul className='flex flex-wrap gap-2'>
                                    {item.ingredients.map((ingredient) => (
                                        <li
                                            key={ingredient}
                                            className='rounded-full bg-moon-caramel px-3.5 py-1.5 text-sm font-bold text-moon-ink'
                                        >
                                            {ingredient}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                        <ItemOptions item={item} />
                    </div>
                </div>
            </div>
        </section>
    );
}

function FoodGridSection({ section }) {
    return (
        <section id={section.id} className={`${SCROLL_MARGIN} py-10 sm:py-16`}>
            <div className='mx-auto max-w-6xl px-4 sm:px-6'>
                <SectionHeading eyebrow={section.eyebrow} title={section.title} price={section.price} />
                <p className='mb-6 max-w-xl text-moon-muted sm:mb-8'>{section.blurb}</p>
                <ul className='grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4'>
                    {section.items.map((item) => (
                        <li key={item.id} className='flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-moon-caramel/20'>
                            {item.image && (
                                <div className='relative aspect-square'>
                                    <Image
                                        src={item.image}
                                        alt=''
                                        fill
                                        sizes='(min-width: 1024px) 270px, 48vw'
                                        className='object-contain p-3'
                                    />
                                </div>
                            )}
                            <div className='flex flex-1 flex-col gap-2 p-3 pt-1 sm:p-4 sm:pt-1'>
                                <div className='flex items-baseline justify-between gap-2'>
                                    <h3 className='text-base font-extrabold leading-tight sm:text-lg'>{item.name}</h3>
                                    {item.price && <span className='shrink-0 font-bold text-moon-orange'>{item.price}</span>}
                                </div>
                                {item.description && <p className='text-sm leading-snug text-moon-muted'>{item.description}</p>}
                                <ItemOptions item={item} />
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

/** "Flavor: Salt & Pepper · Korean Spicy" style choices on a food item. */
function ItemOptions({ item }) {
    if (!item.options?.length) return null;
    return item.options.map((option) => (
        <div key={option.name} className='mt-1'>
            <p className='mb-1.5 text-xs font-bold uppercase tracking-wide text-moon-muted'>{option.name}</p>
            <ul className='flex flex-wrap gap-1.5'>
                {option.choices.map((choice) => (
                    <li key={choice} className='rounded-full bg-moon-orange/10 px-2.5 py-0.5 text-xs font-bold text-moon-orange'>
                        {choice}
                    </li>
                ))}
            </ul>
        </div>
    ));
}

function VisitSection() {
    return (
        <section id='visit' className={`${SCROLL_MARGIN} py-10 sm:py-16`}>
            <div className='mx-auto max-w-6xl px-4 sm:px-6'>
                <SectionHeading eyebrow='Come say hi' title='Visit the Shop' />
                <p className='mb-6 max-w-xl text-moon-muted sm:mb-8'>
                    Find us on N Conway Ave in {info.address.city}. Stop by for a drink and a bite.
                </p>
                <div className='grid gap-4 lg:grid-cols-2 lg:gap-6'>
                    <div className='flex flex-col gap-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-moon-caramel/20 sm:p-6'>
                        <div className='min-h-[2.5rem]'>
                            <ShopOpenStatus info={info} />
                        </div>
                        <div className='flex gap-3'>
                            <MapPin aria-hidden className='mt-1 h-5 w-5 shrink-0 text-moon-orange' />
                            <address className='not-italic'>
                                <span className='block text-lg font-extrabold'>{info.address.street}</span>
                                {info.address.city}, {info.address.state} {info.address.zip}
                            </address>
                        </div>
                        <div className='flex gap-3'>
                            <Phone aria-hidden className='mt-0.5 h-5 w-5 shrink-0 text-moon-orange' />
                            <a href={telHref(info.phone)} className='text-lg font-extrabold underline-offset-4 hover:underline'>
                                {info.phone}
                            </a>
                        </div>
                        <div className='mt-auto flex flex-wrap gap-2 sm:gap-3'>
                            <a
                                href={mapsUrl(info)}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='flex-1 whitespace-nowrap rounded-full bg-moon-ink px-4 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:bg-moon-orange sm:flex-none sm:px-6 sm:text-base'
                            >
                                Get directions
                            </a>
                            <a
                                href={telHref(info.phone)}
                                className='flex-1 whitespace-nowrap rounded-full bg-moon-caramel px-4 py-3 text-center text-sm font-bold text-moon-ink shadow-sm transition hover:bg-moon-orange hover:text-white sm:flex-none sm:px-6 sm:text-base'
                            >
                                Call the shop
                            </a>
                        </div>
                    </div>
                    <div className='rounded-3xl bg-moon-caramel p-5 text-moon-ink shadow-sm sm:p-6'>
                        <h3 className='mb-3 flex items-center gap-2 font-display text-2xl'>
                            <Clock aria-hidden className='h-5 w-5 shrink-0' />
                            Hours
                        </h3>
                        <dl className='space-y-2'>
                            {hoursRows(info).map((row) => (
                                <div
                                    key={row.days}
                                    className='flex flex-col gap-0.5 rounded-2xl bg-white px-4 py-3 shadow-[0_3px_0_#241810] sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-4'
                                >
                                    <dt className='whitespace-nowrap font-extrabold'>{row.days}</dt>
                                    <dd className='whitespace-nowrap font-bold'>{row.time}</dd>
                                </div>
                            ))}
                        </dl>
                        {openEveryDay(info) && <p className='mt-4 font-bold'>Open 7 days a week.</p>}
                    </div>
                </div>
            </div>
        </section>
    );
}

function PopupBand({ popups }) {
    return (
        <section aria-labelledby='popups-heading' className='pb-12 pt-4 sm:pb-20'>
            <div className='mx-auto max-w-6xl px-4 sm:px-6'>
                <div className='flex flex-col items-start gap-5 rounded-[2rem] bg-moon-caramel p-6 text-moon-ink sm:p-8 md:flex-row md:items-center md:justify-between'>
                    <div>
                        <p className='font-script text-xl sm:text-2xl'>On the road</p>
                        <h2 id='popups-heading' className='font-display text-3xl sm:text-4xl'>
                            Catch us at a pop-up
                        </h2>
                        <p className='mt-2 max-w-lg'>We also pop up at markets, festivals and events around town.</p>
                        <div className='mt-4'>
                            <NextPopupTeaser popups={popups} href={POPUPS_HREF} />
                        </div>
                    </div>
                    <a
                        href={POPUPS_HREF}
                        className='shrink-0 rounded-full bg-moon-ink px-6 py-3 font-bold text-white shadow-sm transition hover:bg-moon-orange'
                    >
                        See pop-up dates
                    </a>
                </div>
            </div>
        </section>
    );
}

function Footer() {
    return (
        <footer className='bg-moon-ink py-10 text-moon-cream'>
            <div className='mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center sm:px-6'>
                <p className='font-display text-2xl'>The Moon Tea</p>
                <p className='font-script text-lg text-moon-caramel'>{menu.tagline}</p>
                <p className='text-sm'>
                    <a href={mapsUrl(info)} target='_blank' rel='noopener noreferrer' className='underline-offset-4 hover:underline'>
                        {fullAddress(info)}
                    </a>
                    <span aria-hidden> · </span>
                    <a href={telHref(info.phone)} className='whitespace-nowrap underline-offset-4 hover:underline'>
                        {info.phone}
                    </a>
                </p>
                <p className='text-sm text-moon-cream/70'>
                    {hoursRows(info)
                        .map((row) => `${row.days}: ${row.time}`)
                        .join(' · ')}
                </p>
                <p className='text-sm text-moon-cream/70'>
                    Every drink can be made with your choice of sugar and ice. Menu items may change.
                </p>
            </div>
        </footer>
    );
}
