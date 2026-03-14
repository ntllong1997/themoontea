import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function hashPin(pin) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getEmployees() {
    const { data, error } = await supabase
        .from('employees')
        .select('id, name, role, created_at')
        .order('name');
    if (error) { console.error('getEmployees:', error); return []; }
    return data || [];
}

export async function verifyPin(employeeId, pin) {
    const pinHash = await hashPin(pin);
    const { data, error } = await supabase
        .from('employees')
        .select('id, name, role')
        .eq('id', employeeId)
        .eq('pin_hash', pinHash)
        .single();
    if (error || !data) return null;
    return data;
}

export async function createEmployee(name, pin, role = 'employee') {
    const pinHash = await hashPin(pin);
    const { data, error } = await supabase
        .from('employees')
        .insert({ name, pin_hash: pinHash, role })
        .select('id, name, role')
        .single();
    if (error) throw error;
    return data;
}

export async function updateEmployeePin(id, newPin) {
    const pinHash = await hashPin(newPin);
    const { error } = await supabase
        .from('employees')
        .update({ pin_hash: pinHash })
        .eq('id', id);
    if (error) throw error;
}

export async function deleteEmployee(id) {
    const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id);
    if (error) throw error;
}
