'use client';

// One route serving every prep screen: /order/corndog, /order/drink, and any
// station a future catalog entry declares. A category with no `station` has no
// URL here, so it simply 404s.
//
// Deliberately a client component: `category` carries predicate functions
// (an add-on's `appliesWhen`), which cannot cross a server/client boundary.

import { notFound, useParams } from 'next/navigation';
import StationPage from '@/components/StationPage';
import { categoryForSlug } from '@/lib/menu/catalog';

export default function StationRoute() {
    const { station } = useParams();
    const category = categoryForSlug(station);

    if (!category) notFound();

    return <StationPage category={category} />;
}
