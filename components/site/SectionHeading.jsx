// A customer-site section title: a script eyebrow over a display title, and
// an optional "$8 each" price pill.
export default function SectionHeading({ eyebrow, title, price }) {
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
