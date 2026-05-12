import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ─── Orders ─────────────────────────────────────────────────────────────────

export interface OrderRow {
  id: number;
  order_number: number;
  item_name: string;
  item_type: string;
  customizations: string;
  price: number;
  status: string;
  phone: string | null;
  created_at: string;
}

export async function fetchOrders(): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function updateOrderStatus(id: number, status: string) {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function insertOrders(rows: Omit<OrderRow, 'id' | 'created_at'>[]) {
  const { data, error } = await supabase.from('orders').insert(rows).select();
  if (error) throw error;
  return data;
}

export async function getNextOrderNumber(): Promise<number> {
  const { data, error } = await supabase
    .from('orders')
    .select('order_number')
    .order('order_number', { ascending: false })
    .limit(1);
  if (error) throw error;
  const latest = data?.[0]?.order_number ?? 0;
  return latest + 1;
}

// ─── Menu items (stored in Supabase for persistence) ─────────────────────────

export interface MenuItemRow {
  id: string;
  category: string;
  name: string;
  price: number;
  description: string;
  active: boolean;
  inventory_count: number;
  track_inventory: boolean;
  image_url: string | null;
  sort_order: number;
  customization_groups: string; // JSON stringified
  created_at: string;
}

export async function fetchMenuItems(): Promise<MenuItemRow[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function upsertMenuItem(item: Omit<MenuItemRow, 'created_at'>) {
  const { data, error } = await supabase
    .from('menu_items')
    .upsert(item)
    .select()
    .single();
  if (error) throw error;
  return data as MenuItemRow;
}

export async function deleteMenuItem(id: string) {
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) throw error;
}

export async function adjustInventory(id: string, delta: number) {
  const { error } = await supabase.rpc('adjust_menu_item_inventory', {
    item_id: id,
    delta,
  });
  if (error) throw error;
}
