import { Abril_Fatface, Nunito, Playfair_Display } from 'next/font/google';

const display = Abril_Fatface({ weight: '400', subsets: ['latin'], variable: '--font-display' });
const script = Playfair_Display({ style: 'italic', subsets: ['latin'], variable: '--font-script' });
const body = Nunito({ subsets: ['latin'], variable: '--font-body' });

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
        <div className={`${display.variable} ${script.variable} ${body.variable} min-h-full bg-moon-cream font-body text-moon-ink`}>
            {children}
        </div>
    );
}
