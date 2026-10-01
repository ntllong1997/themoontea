import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { MENU_PHOTO_BUCKET, createAdminClient } from '@/lib/supabase/admin';

const TYPES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Store one item photo and return its public URL. The admin page shrinks the
 * photo in the browser first, so uploads are normally a few hundred KB.
 */
export async function POST(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;

    const form = await request.formData().catch(() => null);
    const file = form?.get('photo');
    if (!file || typeof file === 'string') return NextResponse.json({ error: 'No photo was sent' }, { status: 400 });
    const extension = TYPES[file.type];
    if (!extension) return NextResponse.json({ error: 'Use a JPG, PNG or WebP photo' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That photo is over 5 MB' }, { status: 400 });

    try {
        const supabase = createAdminClient();
        const path = `items/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage
            .from(MENU_PHOTO_BUCKET)
            // Raw bytes, so storage gets the image itself rather than a form wrapper.
            .upload(path, new Uint8Array(await file.arrayBuffer()), {
                contentType: file.type,
                cacheControl: '31536000',
                upsert: false,
            });
        if (error) throw error;
        const { data } = supabase.storage.from(MENU_PHOTO_BUCKET).getPublicUrl(path);
        return NextResponse.json({ url: data.publicUrl }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: error?.message ?? String(error) }, { status: 500 });
    }
}
