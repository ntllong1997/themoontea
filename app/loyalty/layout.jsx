import { customerSiteClass } from '@/lib/site/fonts';

export const metadata = { title: { absolute: 'Rewards · The Moon Tea' } };

export default function LoyaltyLayout({ children }) {
    return <div className={customerSiteClass}>{children}</div>;
}
