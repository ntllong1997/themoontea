import Link from 'next/link';
import {
    Activity,
    CalendarDays,
    CalendarRange,
    ChartColumn,
    ChevronRight,
    CupSoda,
    ExternalLink,
    LogOut,
    MapPin,
    Package,
    QrCode,
    ReceiptText,
    Store,
} from 'lucide-react';
import { DeviceLocationSwitch } from '@/components/LocationPicker';

export const metadata = { title: 'Staff hub' };

// The till comes first; everything else is grouped by what it's for.
// `external` pages are the customer sites, opened in a new tab so the hub stays put.
const GROUPS = [
    {
        title: 'Run the shop',
        links: [
            { href: '/inventory', label: 'Inventory', hint: 'Count stock and see what to restock', icon: Package },
            { href: '/summary', label: 'Sales Summary', hint: 'Sales by day, category and payment', icon: ChartColumn },
            { href: '/admin/schedule', label: 'Staff Schedule', hint: 'Shifts, days off, calendar links and schedule texts', icon: CalendarDays },
        ],
    },
    {
        title: 'Website',
        links: [
            { href: '/shop', label: 'Shop website', hint: 'The home page customers see', icon: Store, external: true },
            { href: '/menu', label: 'Pop-up website', hint: 'Pop-up menu and upcoming dates', icon: MapPin, external: true },
            { href: '/admin/menu', label: 'Pop-up menu items', hint: 'Add, edit, mark sold out or hide', icon: CupSoda },
            { href: '/admin/popups', label: 'Pop-up calendar', hint: 'Where and when you pop up next', icon: CalendarRange },
        ],
    },
    {
        title: 'Devices & payments',
        links: [
            { href: '/cashapp', label: 'Cash App tags', hint: 'Which Cash App QR prints on receipts', icon: QrCode },
            { href: '/admin/logs', label: 'iPad activity log', hint: 'Printer, card reader and order events', icon: Activity },
        ],
    },
];

export default function VendorPage() {
    return (
        <div className='min-h-screen bg-gray-50 pb-16'>
            <header className='border-b border-gray-200 bg-white'>
                <div className='mx-auto flex max-w-3xl items-center gap-3 px-4 py-4'>
                    <div className='flex-1'>
                        <h1 className='text-2xl font-bold tracking-tight'>🌙 The Moon Tea</h1>
                        <p className='text-sm text-gray-600'>Staff hub</p>
                    </div>
                    <form action='/api/logout' method='post'>
                        <button
                            type='submit'
                            className='flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50'
                        >
                            <LogOut className='h-4 w-4' aria-hidden /> Sign out
                        </button>
                    </form>
                </div>
                <div className='mx-auto max-w-3xl px-4 empty:hidden'>
                    <DeviceLocationSwitch />
                </div>
            </header>

            <div className='mx-auto max-w-3xl space-y-8 px-4 pt-6'>
                <Link
                    href='/order'
                    className='flex items-center gap-4 rounded-2xl bg-black px-5 py-5 text-white shadow-sm transition-opacity hover:opacity-85'
                >
                    <span className='flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15'>
                        <ReceiptText className='h-6 w-6' aria-hidden />
                    </span>
                    <span className='min-w-0 flex-1'>
                        <span className='block text-xl font-bold'>Order Track</span>
                        <span className='block text-sm text-white/80'>Take orders, print tickets and take payments</span>
                    </span>
                    <ChevronRight className='h-6 w-6 shrink-0' aria-hidden />
                </Link>

                {GROUPS.map((group, i) => (
                    <section key={group.title} aria-labelledby={`hub-group-${i}`}>
                        <h2 id={`hub-group-${i}`} className='mb-2 text-xs font-bold uppercase tracking-wider text-gray-600'>
                            {group.title}
                        </h2>
                        <ul className='grid gap-2 sm:grid-cols-2 sm:gap-3'>
                            {group.links.map((link) => (
                                <li key={link.href}>
                                    <HubLink {...link} />
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    );
}

function HubLink({ href, label, hint, icon: Icon, external }) {
    const body = (
        <>
            <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-800'>
                <Icon className='h-5 w-5' aria-hidden />
            </span>
            <span className='min-w-0 flex-1'>
                <span className='block font-semibold text-gray-900'>{label}</span>
                <span className='block text-sm text-gray-600'>{hint}</span>
            </span>
            {external ? (
                <>
                    <ExternalLink className='h-4 w-4 shrink-0 text-gray-500' aria-hidden />
                    <span className='sr-only'> (opens in a new tab)</span>
                </>
            ) : (
                <ChevronRight className='h-5 w-5 shrink-0 text-gray-500' aria-hidden />
            )}
        </>
    );
    const className =
        'flex h-full items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 transition-colors hover:bg-gray-50';
    return external ? (
        <a href={href} target='_blank' rel='noopener noreferrer' className={className}>
            {body}
        </a>
    ) : (
        <Link href={href} className={className}>
            {body}
        </Link>
    );
}
