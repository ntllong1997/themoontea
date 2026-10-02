// The loyalty punch card: one circle per stamp, and the free drink at the end.

export default function PunchCard({ card }) {
    const { stamps, perReward, rewardsAvailable, totalDrinks } = card;
    const toGo = perReward - stamps;
    return (
        <div className='rounded-3xl bg-white p-5 shadow-sm ring-1 ring-moon-caramel/30'>
            <p className='font-script text-xl text-moon-orange'>The Moon Tea</p>
            <p className='font-display text-2xl'>Boba punch card</p>
            <ol
                className='mt-4 grid grid-cols-5 gap-2'
                aria-label={`${stamps} of ${perReward} stamps on this card`}
            >
                {Array.from({ length: perReward }, (_, i) => (
                    <li
                        key={i}
                        className={`flex aspect-square items-center justify-center rounded-full border-2 text-lg font-bold ${
                            i < stamps
                                ? 'border-moon-ink bg-moon-caramel text-moon-ink'
                                : 'border-dashed border-moon-caramel/60 text-moon-muted'
                        }`}
                    >
                        <span aria-hidden>{i < stamps ? '🧋' : i + 1}</span>
                        <span className='sr-only'>{i < stamps ? `Stamp ${i + 1}, filled` : `Stamp ${i + 1}, empty`}</span>
                    </li>
                ))}
                <li className='flex aspect-square flex-col items-center justify-center rounded-full bg-moon-ink text-center text-white'>
                    <span aria-hidden className='text-lg'>🎁</span>
                    <span className='text-[10px] font-bold uppercase leading-tight'>Free</span>
                </li>
            </ol>
            <p className='mt-4 text-moon-ink' aria-live='polite'>
                {rewardsAvailable > 0 ? (
                    <strong>
                        🎉 {rewardsAvailable === 1 ? 'You have a free drink ready!' : `You have ${rewardsAvailable} free drinks ready!`}
                    </strong>
                ) : (
                    <>
                        <strong>{toGo}</strong> more {toGo === 1 ? 'drink' : 'drinks'} until your free drink.
                    </>
                )}
            </p>
            <p className='mt-1 text-sm text-moon-muted'>
                {totalDrinks} {totalDrinks === 1 ? 'drink' : 'drinks'} so far. Every {perReward} drinks, the next one is on us.
            </p>
        </div>
    );
}
