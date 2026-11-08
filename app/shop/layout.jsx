import { siteFontVariables } from '@/components/site/fonts';

export const metadata = {
    title: { absolute: 'The Moon Tea Shop · Menu' },
    description:
        'The Moon Tea in Palmhurst, TX: milk tea, fruit tea, smoothies, coffee, matcha, Korean corndogs, Buldak elote and sides. Menu, hours and directions.',
    openGraph: {
        title: 'The Moon Tea Shop · Menu',
        description: 'Milk tea, fruit tea, smoothies, coffee, matcha, Korean corndogs and more, in Palmhurst, TX.',
    },
};

export default function ShopLayout({ children }) {
    return (
        <div className={`${siteFontVariables} min-h-full bg-moon-cream font-body text-moon-ink`}>
            {children}
        </div>
    );
}
