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

/** A little boba cup filled with the drink's colour. */
function Cup({ tint, size = 56 }) {
    return (
        <svg width={size} height={size * 1.25} viewBox='0 0 48 60' aria-hidden='true' className='shrink-0'>
            <rect x='22.5' y='1' width='3' height='16' rx='1.5' fill='#3b2a20' opacity='0.85' />
            <path d='M8 14 H40 L36 56 Q35.6 59 32.6 59 H15.4 Q12.4 59 12 56 Z' fill='#fff' opacity='0.7' />
            <path d='M10 20 H38 L35 55 Q34.7 57.5 32.2 57.5 H15.8 Q13.3 57.5 13 55 Z' fill={tint} />
            <path d='M10 20 H38 L37.6 24 H10.4 Z' fill='#fff' opacity='0.35' />
            {[[18, 50], [24, 52], [30, 50], [21, 46], [27, 46]].map(([cx, cy]) => (
                <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r='2.3' fill='#3b2a20' opacity='0.8' />
            ))}
            <rect x='6' y='11' width='36' height='4' rx='2' fill='#3b2a20' opacity='0.85' />
        </svg>
    );
}

function SectionHeading({ title, blurb, className = '' }) {
    return (
        <div className={`mb-6 ${className}`}>
            <h2 className='font-serif text-3xl font-bold uppercase tracking-wide text-[#3b2a20] sm:text-4xl'>{title}</h2>
            {blurb && <p className='mt-1 text-[#7a5a45]'>{blurb}</p>}
            <div className='mt-3 h-0 w-24 border-t-4 border-dotted border-[#3b2a20]' />
        </div>
    );
}

function DrinkCard({ item }) {
    return (
        <li
            className={`flex items-center gap-3 rounded-2xl bg-white/70 p-3 sm:gap-4 sm:p-4 shadow-sm ring-1 ring-[#3b2a20]/5 ${
                item.signature ? 'col-span-2' : ''
            }`}
        >
            <Cup tint={item.tint} size={item.signature ? 56 : 40} />
            <div className='min-w-0'>
                <p className={`font-semibold uppercase leading-tight text-[#3b2a20] ${item.signature ? 'text-lg' : 'text-sm sm:text-base'}`}>
                    {item.name}
                </p>
                {item.note && <p className='mt-0.5 text-sm text-[#7a5a45]'>{item.note}</p>}
            </div>
        </li>
    );
}

function DrinkSection({ section }) {
    return (
        <section id={section.id} className='scroll-mt-28'>
            <SectionHeading title={section.title} blurb={section.blurb} />
            <ul className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
                {section.items.map((item) => (
                    <DrinkCard key={item.name} item={item} />
                ))}
            </ul>
            {section.extras && (
                <div className='mt-4 rounded-2xl border-2 border-dashed border-[#3b2a20]/25 p-4'>
                    <p className='mb-2 text-sm font-semibold uppercase tracking-wide text-[#7a5a45]'>{section.extras.title}</p>
                    <ul className='grid grid-cols-2 gap-x-4 gap-y-1 text-[#3b2a20] sm:grid-cols-4'>
                        {section.extras.items.map((name) => (
                            <li key={name}>{name}</li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}

function Chip({ children, className = '' }) {
    return (
        <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${className}`}>{children}</span>
    );
}

export default function MenuPage() {
    return (
        <div className='min-h-full bg-[#fdeee4] text-[#3b2a20]'>
            <header className='sticky top-0 z-10 border-b border-[#3b2a20]/10 bg-[#fdeee4]/90 backdrop-blur'>
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
                    <div className='mx-auto mt-6 grid max-w-md grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-left text-sm'>
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
                    <h2 className='mb-6 text-4xl font-black text-[#ff5a6e] [text-shadow:2px_2px_0_#3b2a20] sm:text-5xl'>
                        Korean Corndog
                    </h2>
                    <div className='grid gap-4 lg:grid-cols-3'>
                        <div className='rounded-3xl border-4 border-[#e0a24d] bg-white/80 p-6'>
                            <p className='mb-1 text-sm font-semibold uppercase tracking-wide text-[#7a5a45]'>Step 1</p>
                            <h3 className='mb-4 text-2xl font-bold'>Pick the inside</h3>
                            <ul className='space-y-2'>
                                {CORNDOG.inside.map((name) => (
                                    <li key={name} className='flex items-center gap-3 font-semibold'>
                                        <span className='h-3 w-10 rounded-full bg-gradient-to-r from-[#e8604c] to-[#f6d77a]' />
                                        {name}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className='rounded-3xl border-4 border-[#e0a24d] bg-white/80 p-6 lg:col-span-2'>
                            <p className='mb-1 text-sm font-semibold uppercase tracking-wide text-[#7a5a45]'>Step 2</p>
                            <h3 className='mb-4 text-2xl font-bold'>Pick the coating</h3>
                            <ul className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
                                {CORNDOG.outside.map(({ name, tint }) => (
                                    <li key={name} className='flex items-center gap-3 rounded-2xl bg-[#fdeee4] p-3 font-semibold'>
                                        <span className='h-10 w-4 shrink-0 rounded-full' style={{ backgroundColor: tint }} />
                                        {name}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </section>

                <section id='snacks' className='scroll-mt-28'>
                    <div className='grid gap-4 lg:grid-cols-2'>
                        <div className='rounded-3xl bg-[#ff5a6e] p-6 text-white sm:p-8'>
                            <h2 className='text-4xl font-black [text-shadow:2px_2px_0_#3b2a20] sm:text-5xl'>Buldak Elote</h2>
                            <p className='mt-2 text-white/90'>Spicy carbonara Buldak noodles loaded up in a cup with:</p>
                            <ul className='mt-4 flex flex-wrap gap-2'>
                                {BULDAK_ELOTE.map((name) => (
                                    <li key={name}>
                                        <Chip className='bg-white text-[#3b2a20]'>{name}</Chip>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className='rounded-3xl border-4 border-[#e0a24d] bg-white/80 p-6 sm:p-8'>
                            <SectionHeading title='Snacks' className='!mb-4' />
                            <ul className='divide-y divide-[#3b2a20]/10'>
                                {SNACKS.map(({ name, seasonings }) => (
                                    <li key={name} className='flex flex-wrap items-center justify-between gap-2 py-3'>
                                        <span className='text-lg font-bold'>{name}</span>
                                        {seasonings.length > 0 && (
                                            <span className='flex flex-wrap gap-1.5'>
                                                {seasonings.map((s) => (
                                                    <Chip key={s} className='bg-[#fdeee4] !text-xs'>{s}</Chip>
                                                ))}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </section>
            </main>

            <footer className='border-t border-[#3b2a20]/10 py-8 text-center text-sm text-[#7a5a45]'>
                🌙 The Moon Tea · Ask our staff about today&apos;s specials
            </footer>
        </div>
    );
}
