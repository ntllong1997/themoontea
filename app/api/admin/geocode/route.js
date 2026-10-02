import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';

/**
 * Address -> map pin, for the pop-up editor's "Find from address" button,
 * using OpenStreetMap's free geocoder. It asks for light use and a real
 * User-Agent; a staff member pressing a button now and then is well within it.
 */
export async function GET(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const query = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 200);
    if (!query) return NextResponse.json({ error: 'Type an address first.' }, { status: 400 });
    try {
        const url = new URL('https://nominatim.openstreetmap.org/search');
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('limit', '1');
        url.searchParams.set('countrycodes', 'us');
        url.searchParams.set('q', query);
        const response = await fetch(url, {
            headers: { 'User-Agent': 'TheMoonTea/1.0 (pop-up calendar)', Accept: 'application/json' },
            cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Map lookup failed (${response.status})`);
        const [hit] = await response.json();
        if (!hit) return NextResponse.json({ error: 'No match for that address. Try adding the city, or use "Use my location" at the spot.' }, { status: 404 });
        return NextResponse.json({ latitude: Number(hit.lat), longitude: Number(hit.lon), label: hit.display_name });
    } catch (error) {
        return NextResponse.json({ error: error?.message ?? String(error) }, { status: 502 });
    }
}
