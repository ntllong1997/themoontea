import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ─── Inventory groups (item master list) ─────────────────────────────────────

export async function getInventoryGroups() {
    const { data, error } = await supabase
        .from('inventory_items')
        .select('category, name, sort_order')
        .order('sort_order');
    if (error) { console.error('getInventoryGroups:', error); return null; }
    if (!data || data.length === 0) return null;
    const seen = [];
    const map  = {};
    for (const row of data) {
        if (!map[row.category]) { map[row.category] = []; seen.push(row.category); }
        map[row.category].push(row.name);
    }
    return seen.map((cat) => ({ category: cat, items: map[cat] }));
}

export async function saveInventoryGroups(groups) {
    const rows = [];
    groups.forEach((g, gi) => {
        g.items.forEach((name, ii) => {
            rows.push({ category: g.category, name, sort_order: gi * 1000 + ii });
        });
    });
    const { error: delErr } = await supabase.from('inventory_items').delete().not('id', 'is', null);
    if (delErr) throw delErr;
    if (rows.length > 0) {
        const { error } = await supabase.from('inventory_items').insert(rows);
        if (error) throw error;
    }
}

// ─── Par levels ───────────────────────────────────────────────────────────────

export async function getParLevels() {
    const { data, error } = await supabase
        .from('inventory_par_levels')
        .select('item_name, par_level');
    if (error) { console.error('getParLevels:', error); return {}; }
    return Object.fromEntries((data || []).map((r) => [r.item_name, r.par_level]));
}

export async function saveParLevel(itemName, parLevel) {
    if (parLevel > 0) {
        const { error } = await supabase
            .from('inventory_par_levels')
            .upsert({ item_name: itemName, par_level: parLevel }, { onConflict: 'item_name' });
        if (error) throw error;
    } else {
        const { error } = await supabase
            .from('inventory_par_levels')
            .delete()
            .eq('item_name', itemName);
        if (error) throw error;
    }
}

// ─── Restock levels ───────────────────────────────────────────────────────────

export async function getRestockLevels() {
    const { data, error } = await supabase
        .from('inventory_restock_levels')
        .select('item_name, restock_qty');
    if (error) { console.error('getRestockLevels:', error); return {}; }
    return Object.fromEntries((data || []).map((r) => [r.item_name, r.restock_qty]));
}

export async function saveRestockLevel(itemName, restockQty) {
    if (restockQty > 0) {
        const { error } = await supabase
            .from('inventory_restock_levels')
            .upsert({ item_name: itemName, restock_qty: restockQty }, { onConflict: 'item_name' });
        if (error) throw error;
    } else {
        const { error } = await supabase
            .from('inventory_restock_levels')
            .delete()
            .eq('item_name', itemName);
        if (error) throw error;
    }
}

// ─── Submission history ───────────────────────────────────────────────────────

export async function getInventorySubmissions() {
    const { data, error } = await supabase
        .from('inventory_submissions')
        .select('*')
        .order('submitted_at', { ascending: false })
        .limit(50);
    if (error) { console.error('getInventorySubmissions:', error); return []; }
    return (data || []).map((row) => ({
        _id:          row.id,
        employeeName: row.employee_name,
        notes:        row.notes,
        submittedAt:  row.submitted_at,
        items:        row.items,
    }));
}

export async function saveInventorySubmission(payload) {
    const { data, error } = await supabase
        .from('inventory_submissions')
        .insert({
            employee_name: payload.employeeName,
            notes:         payload.notes || null,
            submitted_at:  payload.submittedAt,
            items:         payload.items,
        })
        .select('id')
        .single();
    if (error) throw error;
    return data.id;
}

export async function deleteInventorySubmission(id) {
    const { error } = await supabase
        .from('inventory_submissions')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

export async function clearInventorySubmissions() {
    const { error } = await supabase
        .from('inventory_submissions')
        .delete()
        .not('id', 'is', null);
    if (error) throw error;
}
