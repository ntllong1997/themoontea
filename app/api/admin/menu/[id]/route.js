import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/requireStaff';
import { MENU_PHOTO_BUCKET, createAdminClient } from '@/lib/supabase/admin';
import { parseItemInput } from '@/lib/site/menuAdmin';

const COLUMNS = 'id, category, name, description, price, price_note, image_url, status, tags, sort_order, updated_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const failure = (error, status = 500) =>
    NextResponse.json({ error: error?.message ?? String(error) }, { status });

/** The bucket path of a photo we uploaded, or null for a built-in /menu/ photo. */
function bucketPath(imageUrl) {
    const marker = `/storage/v1/object/public/${MENU_PHOTO_BUCKET}/`;
    const at = imageUrl?.indexOf(marker) ?? -1;
    return at === -1 ? null : imageUrl.slice(at + marker.length);
}

/** Change some fields of one item: status, price, photo, anything. */
export async function PATCH(request, { params }) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { id } = await params;
    if (!UUID.test(id)) return failure('Unknown item', 404);

    const { values, error: invalid } = parseItemInput(await request.json().catch(() => null), {
        partial: true,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    });
    if (invalid) return failure(invalid, 400);

    try {
        const supabase = createAdminClient();
        const { data: before } = await supabase.from('site_menu_items').select('image_url').eq('id', id).single();
        const { data, error } = await supabase
            .from('site_menu_items')
            .update(values)
            .eq('id', id)
            .select(COLUMNS)
            .single();
        if (error) throw error;

        // A replaced photo we uploaded is no longer used by anything.
        const oldPath = 'image_url' in values && before?.image_url !== data.image_url ? bucketPath(before?.image_url) : null;
        if (oldPath) await supabase.storage.from(MENU_PHOTO_BUCKET).remove([oldPath]);

        revalidatePath('/menu');
        return NextResponse.json({ item: data });
    } catch (error) {
        return failure(error);
    }
}

/** Remove an item for good, along with its uploaded photo. */
export async function DELETE(request, { params }) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { id } = await params;
    if (!UUID.test(id)) return failure('Unknown item', 404);

    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('site_menu_items')
            .delete()
            .eq('id', id)
            .select('image_url')
            .single();
        if (error) throw error;
        const path = bucketPath(data?.image_url);
        if (path) await supabase.storage.from(MENU_PHOTO_BUCKET).remove([path]);
        revalidatePath('/menu');
        return NextResponse.json({ ok: true });
    } catch (error) {
        return failure(error);
    }
}
