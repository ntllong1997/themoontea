/* eslint-disable @next/next/no-img-element -- static crops, already sized for the web */
import {
    BULDAK_ELOTE,
    CORNDOG,
    DRINK_SECTIONS,
    NAV_SECTIONS,
    SNACKS,
    SUGAR_ICE_LEVELS,
    TOPPINGS,
    TOPPING_PRICE,
} from '@/lib/menu/publicMenu';

export const metadata = {
    title: 'Menu · The Moon Tea',
    description: 'Milk tea, fruit tea, smoothies, coffee, matcha, Korean corndogs and snacks at The Moon Tea.',
};

// The photos were cropped from the printed menu, so their backgrounds are these
// exact colours. Matching them makes each photo sit seamlessly on the page.
const PAGE_BG = 'bg-[#ffe8d4]';
const PANEL_BG = 'bg-[#ffeae2]';

function SectionHeading({ title, blurb }) {
    return (
        <div className='mb-6'>
            <h2 className='font-serif text-3xl font-bold uppercase tracking-wide sm:text-4xl'>{title}</h2>
            {blurb && <p className='mt-1 text-[#7a5a45]'>{blurb}</p>}
            <div className='mt-3 w-24 border-t-4 border-dotted border-[#3b2a20]' />
        </div>
    );
}

function DrinkPhoto({ item }) {
    return (
        <li className={`group flex flex-col items-center text-center ${item.signature ? 'col-span-2 row-span-2' : ''}`}>
            <div className={`flex w-full items-end justify-center ${item.signature ? 'h-80 sm:h-[26rem]' : 'h-40 sm:h-48'}`}>
                <img
                    src={item.image}
                    alt={item.name}
                    loading='lazy'
                    className='max-h-full max-w-full object-contain transition-transform duration-200 group-hover:-translate-y-1'
                />
            </div>
            <p className={`mt-2 font-extrabold uppercase leading-tight ${item.signature ? 'text-2xl' : 'text-sm sm:text-base'}`}>
                {item.name}
            </p>
            {item.note && <p className='mt-0.5 text-xs text-[#7a5a45] sm:text-sm'>{item.note}</p>}
        </li>
    );
}

function DrinkSection({ section }) {
    const withPhoto = section.items.filter((item) => item.image);
    const listOnly = section.items.filter((item) => !item.image);

    return (
        <section id={section.id} className='scroll-mt-28'>
            <SectionHeading title={section.title} blurb={section.blurb} />
            <div className={listOnly.length > 0 && withPhoto.length <= 2 ? 'grid items-end gap-6 sm:grid-cols-2' : ''}>
                <ul className={`grid gap-x-3 gap-y-6 ${
                    withPhoto.length <= 2 ? 'grid-cols-2' : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6'
                }`}>
                    {withPhoto.map((item) => (
                        <DrinkPhoto key={item.name} item={item} />
                    ))}
                </ul>
                {listOnly.length > 0 && (
                    <ul className={`grid gap-x-6 gap-y-2 rounded-2xl border-2 border-dashed border-[#3b2a20]/25 p-5 text-lg ${
                        withPhoto.length <= 2 ? 'self-center' : 'mt-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                    }`}>
                        {listOnly.map((item) => (
                            <li key={item.name}>{item.name}</li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}

function Chip({ children, className = '' }) {
    return <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${className}`}>{children}</span>;
}

function CorndogChoice({ item, height }) {
    return (
        <li className='flex flex-col items-center text-center'>
            <div className={`flex w-full items-end justify-center ${height}`}>
                <img src={item.image} alt={item.name} loading='lazy' className='max-h-full max-w-full object-contain' />
            </div>
            <p className='mt-2 font-extrabold italic'>{item.name}</p>
        </li>
    );
}

export default function MenuPage() {
    return (
        <div className={`min-h-full ${PAGE_BG} text-[#3b2a20]`}>
            <header className={`sticky top-0 z-10 border-b border-[#3b2a20]/10 bg-[#ffe8d4]/90 backdrop-blur`}>
                <div className='mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between'>
                    <a href='#top' className='font-serif text-2xl font-bold tracking-wide'>
                        🌙 The Moon Tea
                    </a>
                    <nav aria-label='Menu sections' className='-mx-4 overflow-x-auto px-4'>
                        <ul className='flex gap-2 whitespace-nowrap'>
                            {NAV_SECTIONS.map(({ id, title }) => (
                                <li key={id}>
                                    <a
                                        href={`#${id}`}
                                        className='inline-block rounded-full bg-white/70 px-3 py-1.5 text-sm font-semibold ring-1 ring-[#3b2a20]/10 transition-colors hover:bg-[#3b2a20] hover:text-white'
                                    >
                                        {title}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </div>
            </header>

            <main id='top' className='mx-auto max-w-6xl space-y-16 px-4 py-10'>
                <section className='text-center'>
                    <p className='text-sm font-semibold uppercase tracking-[0.3em] text-[#c0703a]'>Boba · Coffee · Korean Corndogs</p>
                    <h1 className='mt-3 font-serif text-5xl font-bold uppercase sm:text-6xl'>Our Menu</h1>
                    <p className='mx-auto mt-4 max-w-xl text-[#7a5a45]'>
                        Every drink can be made your way. Pick your sugar and ice level, then add a topping or two.
                    </p>
                    <div className='mx-auto mt-6 grid max-w-md grid-cols-[auto_1fr] items-center gap-x-4 text-left text-sm'>
                        <span className='font-semibold'>Sugar / Ice</span>
                        <div className='flex overflow-hidden rounded-full ring-1 ring-[#3b2a20]/10'>
                            {SUGAR_ICE_LEVELS.map((level, i) => (
                                <span
                                    key={level}
                                    className={`flex-1 whitespace-nowrap px-1.5 py-1 text-center text-[11px] font-semibold sm:text-xs ${
                                        ['bg-[#fff7d6]', 'bg-[#fbe28a]', 'bg-[#f2c14e]', 'bg-[#c98a3a] text-white'][i]
                                    }`}
                                >
                                    {level}
                                </span>
                            ))}
                        </div>
                    </div>
                </section>

                {DRINK_SECTIONS.map((section) => (
                    <DrinkSection key={section.id} section={section} />
                ))}

                <section id='toppings' className='scroll-mt-28'>
                    <div className='rounded-3xl bg-[#c98a3a] p-6 text-white sm:p-8'>
                        <div className='mb-4 flex flex-wrap items-baseline justify-between gap-2'>
                            <h2 className='font-serif text-3xl font-bold uppercase sm:text-4xl'>Toppings</h2>
                            <span className='rounded-full bg-white px-4 py-1 text-lg font-bold text-[#3b2a20]'>
                                ${TOPPING_PRICE.toFixed(2)} each
                            </span>
                        </div>
                        <ul className='flex flex-wrap gap-2'>
                            {TOPPINGS.map((topping) => (
                                <li key={topping}>
                                    <Chip className='bg-white/20 ring-1 ring-white/40'>{topping}</Chip>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <section id='corndog' className='scroll-mt-28'>
                    <h2 className='mb-6 text-4xl font-black text-[#ff3b1f] sm:text-5xl'>
                        <span className='rounded-xl bg-[#ffb8d9] px-3 leading-snug [box-decoration-break:clone]'>Korean Corndog</span>
                    </h2>
                    <div className='grid gap-4 lg:grid-cols-3'>
                        <div className={`rounded-3xl border-[6px] border-[#e0a24d] ${PANEL_BG} p-6`}>
                            <p className='text-sm font-semibold uppercase tracking-wide text-[#7a5a45]'>Step 1</p>
                            <h3 className='mb-4 text-2xl font-bold'>Pick the inside</h3>
                            <ul className='grid grid-cols-3 gap-3'>
                                {CORNDOG.inside.map((item) => (
                                    <CorndogChoice key={item.name} item={item} height='h-40' />
                                ))}
                            </ul>
                        </div>
                        <div className={`rounded-3xl border-[6px] border-[#e0a24d] ${PANEL_BG} p-6 lg:col-span-2`}>
                            <p className='text-sm font-semibold uppercase tracking-wide text-[#7a5a45]'>Step 2</p>
                            <h3 className='mb-4 text-2xl font-bold'>Pick the coating</h3>
                            <ul className='grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-6'>
                                {CORNDOG.outside.map((item) => (
                                    <CorndogChoice key={item.name} item={item} height='h-44' />
                                ))}
                            </ul>
                        </div>
                    </div>
                </section>

                <section id='snacks' className='scroll-mt-28 space-y-6'>
                    <div className='grid items-center gap-6 sm:grid-cols-2'>
                        <img
                            src={BULDAK_ELOTE.image}
                            alt='Buldak Elote'
                            loading='lazy'
                            className='mx-auto max-h-96 object-contain [mask-image:radial-gradient(ellipse_at_center,black_60%,transparent_72%)]'
                        />
                        <div>
                            <h2 className='text-4xl font-black text-[#ff3b1f] sm:text-5xl'>
                                <span className='rounded-xl bg-[#ffb8d9] px-3 leading-snug [box-decoration-break:clone]'>Buldak Elote</span>
                            </h2>
                            <p className='mt-4 text-lg text-[#7a5a45]'>Carbonara Buldak noodles loaded up in a cup with:</p>
                            <ul className='mt-3 flex flex-wrap gap-2'>
                                {BULDAK_ELOTE.toppings.map((name) => (
                                    <li key={name}>
                                        <Chip className='bg-white font-bold italic'>{name}</Chip>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className={`rounded-3xl border-[6px] border-[#e0a24d] ${PANEL_BG} p-6 sm:p-8`}>
                        <SectionHeading title='Snacks' />
                        <ul className='grid grid-cols-2 gap-6 lg:grid-cols-4'>
                            {SNACKS.map(({ name, image, seasonings }) => (
                                <li key={name} className='flex flex-col items-center text-center'>
                                    <img src={image} alt={name} loading='lazy' className='aspect-square w-full max-w-[14rem] object-contain' />
                                    <p className='mt-2 text-lg font-bold'>{name}</p>
                                    {seasonings.length > 0 && (
                                        <p className='mt-1 flex flex-wrap justify-center gap-1.5'>
                                            {seasonings.map((s) => (
                                                <Chip key={s} className='bg-white !text-xs'>{s}</Chip>
                                            ))}
                                        </p>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>
            </main>

            <footer className='border-t border-[#3b2a20]/10 py-8 text-center text-sm text-[#7a5a45]'>
                🌙 The Moon Tea · Ask our staff about today&apos;s specials
            </footer>
        </div>
    );
}
