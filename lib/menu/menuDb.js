// Supabase access for the editable menu (table + RPC defined in
// supabase/migrations/20260927060000_add_menu_config.sql).
import { createClient } from '@supabase/supabase-js';
import { hashPin } from '@/lib/employeesDb';
import { parseMenuConfig } from '@/lib/menu/menuConfig';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const MENU_TABLE = 'menu_config';
const NOT_ADMIN = '42501';

/**
 * The stored menu row, unvalidated — callers must run it through
 * parseMenuConfig. Resolves to null when nothing has been saved yet; throws
 * on a network or database error so the caller can fall back.
 *
 * @returns {Promise<{ config: unknown, updatedAt: string, updatedBy: string|null } | null>}
 */
export async function fetchMenuRow() {
    const { data, error } = await supabase
        .from(MENU_TABLE)
        .select('config, updated_at, updated_by')
        .eq('id', 1)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { config: data.config, updatedAt: data.updated_at, updatedBy: data.updated_by };
}

/** Just the stored config, for loadMenuConfig. */
export const fetchMenuConfig = async () => (await fetchMenuRow())?.config ?? null;

/**
 * Save a menu. Validated here for friendly messages, and the admin PIN is
 * checked again by the database, which is the real gate.
 *
 * @returns {Promise<{ ok: true, savedAt: string } | { ok: false, errors: string[] }>}
 */
export async function saveMenuConfig({ employeeId, pin, config: rawConfig }) {
    const { config, errors } = parseMenuConfig(rawConfig);
    if (!config) return { ok: false, errors };

    const { data, error } = await supabase.rpc('save_menu', {
        p_employee_id: employeeId,
        p_pin_hash: await hashPin(pin),
        p_config: config,
    });

    if (error) {
        console.error('saveMenuConfig:', error);
        const message = error.code === NOT_ADMIN
            ? 'Only an admin can edit the menu — check your PIN.'
            : 'Could not save the menu. Check the internet connection and try again.';
        return { ok: false, errors: [message] };
    }
    return { ok: true, savedAt: data };
}
