import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const buildMockExtraction = (receiptId) => {
    const now = new Date();
    const totalAmount = 24.58;
    const items = [
        {
            item_name: 'Iced tea',
            quantity: 1,
            unit_price: 4.5,
            line_total: 4.5,
        },
        {
            item_name: 'Boba milk tea',
            quantity: 1,
            unit_price: 6.75,
            line_total: 6.75,
        },
        {
            item_name: 'Mochi donut',
            quantity: 2,
            unit_price: 6.665,
            line_total: 13.33,
        },
    ];

    return {
        location: 'Moon Tea Cafe',
        total_amount: totalAmount,
        receipt_datetime: now.toISOString(),
        payment_method_type: 'visa',
        payment_method_last4: '4242',
        ai_confidence: 0.912,
        raw_ocr_text: `Mock OCR for ${receiptId}`,
        items,
    };
};

export async function POST(request) {
    let receiptId;
    let accessToken;

    try {
        const body = await request.json();
        receiptId = body.receipt_id;
        accessToken = body.access_token;

        if (!receiptId || !accessToken) {
            return NextResponse.json(
                { error: 'Missing receipt_id or access_token.' },
                { status: 400 }
            );
        }

        const supabase = createSupabaseServerClient(accessToken);
        const { data: receipt, error: receiptError } = await supabase
            .from('receipts')
            .select('id, image_url')
            .eq('id', receiptId)
            .single();

        if (receiptError || !receipt) {
            return NextResponse.json(
                { error: 'Receipt not found.' },
                { status: 404 }
            );
        }

        const extraction = buildMockExtraction(receiptId);

        const { error: updateError } = await supabase
            .from('receipts')
            .update({
                location: extraction.location,
                total_amount: extraction.total_amount,
                receipt_datetime: extraction.receipt_datetime,
                payment_method_type: extraction.payment_method_type,
                payment_method_last4: extraction.payment_method_last4,
                ai_status: 'processed',
                ai_confidence: extraction.ai_confidence,
                raw_ocr_text: extraction.raw_ocr_text,
            })
            .eq('id', receiptId);

        if (updateError) {
            throw updateError;
        }

        const { error: deleteError } = await supabase
            .from('receipt_items')
            .delete()
            .eq('receipt_id', receiptId);

        if (deleteError) {
            throw deleteError;
        }

        if (extraction.items?.length) {
            const itemsToInsert = extraction.items.map((item) => ({
                receipt_id: receiptId,
                item_name: item.item_name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                line_total: item.line_total,
            }));

            const { error: insertError } = await supabase
                .from('receipt_items')
                .insert(itemsToInsert);

            if (insertError) {
                throw insertError;
            }
        }

        return NextResponse.json({ status: 'ok' });
    } catch (error) {
        const message = error?.message || 'AI extraction failed.';

        if (receiptId && accessToken) {
            const supabase = createSupabaseServerClient(accessToken);
            await supabase
                .from('receipts')
                .update({
                    ai_status: 'failed',
                    raw_ocr_text: message,
                })
                .eq('id', receiptId);
        }

        return NextResponse.json({ error: message }, { status: 500 });
    }
}