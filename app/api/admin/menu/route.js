import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/requireStaff';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseItemInput } from '@/lib/site/menuAdmin';

const COLUMNS = 'id, category, name, description, price, price_note, image_url, status, tags, sort_order, updated_at';

const failure = (error, status = 500) =>
    NextResponse.json({ error: error?.message ?? String(error) }, { status });

/** Every item, hidden ones included, for the admin page. */
export async function GET(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    try {
        const { data, error } = await createAdminClient()
            .from('site_menu_items')
            .select(COLUMNS)
            .order('sort_order');
        if (error) throw error;
        return NextResponse.json({ items: data });
    } catch (error) {
        return failure(error);
    }
}

/** Add an item. It goes to the end of its category unless told otherwise. */
export async function POST(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;

    const { values, error: invalid } = parseItemInput(await request.json().catch(() => null), {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    });
    if (invalid) return failure(invalid, 400);

    try {
        const supabase = createAdminClient();
        if (values.sort_order === undefined) {
            const { data: last } = await supabase
                .from('site_menu_items')
                .select('sort_order')
                .order('sort_order', { ascending: false })
                .limit(1);
            values.sort_order = (last?.[0]?.sort_order ?? 0) + 10;
        }
        const { data, error } = await supabase.from('site_menu_items').insert(values).select(COLUMNS).single();
        if (error) throw error;
        revalidatePath('/menu');
        return NextResponse.json({ item: data }, { status: 201 });
    } catch (error) {
        return failure(error);
    }
}
