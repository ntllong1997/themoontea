import { customerSiteClass } from '@/lib/site/fonts';

export const metadata = {
    title: { absolute: 'The Moon Tea · Boba & Bites' },
    description:
        'Brown sugar boba, fruit teas and Korean corndogs from The Moon Tea pop-up. See the menu and find our next pop-up.',
    openGraph: {
        title: 'The Moon Tea · Boba & Bites',
        description: 'See the menu and find our next pop-up.',
    },
};

export default function MenuLayout({ children }) {
    return (
        <div className={customerSiteClass}>
            {children}
        </div>
    );
}
