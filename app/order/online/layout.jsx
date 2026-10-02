import { customerSiteClass } from '@/lib/site/fonts';

export const metadata = { title: { absolute: 'Order ahead · The Moon Tea' } };

export default function OnlineOrderLayout({ children }) {
    return <div className={customerSiteClass}>{children}</div>;
}
