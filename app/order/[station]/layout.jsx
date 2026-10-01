import { categoryForSlug } from '@/lib/menu/catalog';

export async function generateMetadata({ params }) {
    const { station } = await params;
    const category = categoryForSlug(station);
    return { title: category ? `${category.label} Station` : 'Station' };
}

export default function Layout({ children }) {
    return children;
}
