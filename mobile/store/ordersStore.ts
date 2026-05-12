import { create } from 'zustand';
import {
  fetchOrders,
  updateOrderStatus,
  insertOrders,
  getNextOrderNumber,
  OrderRow,
} from '@/lib/supabase';

export interface GroupedOrder {
  orderNumber: number;
  items: OrderRow[];
  createdAt: string;
  phone: string | null;
  status: string; // derived from items
}

function deriveStatus(items: OrderRow[]): string {
  const statuses = items.map((i) => i.status);
  if (statuses.every((s) => s === 'picked up')) return 'picked up';
  if (statuses.some((s) => s === 'ready')) return 'ready';
  if (statuses.some((s) => s === 'making')) return 'making';
  return 'new';
}

function groupOrders(rows: OrderRow[]): GroupedOrder[] {
  const map = new Map<number, OrderRow[]>();
  for (const row of rows) {
    const arr = map.get(row.order_number) ?? [];
    arr.push(row);
    map.set(row.order_number, arr);
  }
  return Array.from(map.entries())
    .map(([orderNumber, items]) => ({
      orderNumber,
      items,
      createdAt: items[0]?.created_at ?? '',
      phone: items[0]?.phone ?? null,
      status: deriveStatus(items),
    }))
    .sort((a, b) => b.orderNumber - a.orderNumber);
}

interface OrdersState {
  groups: GroupedOrder[];
  loading: boolean;
  lastFetch: number;
  load: () => Promise<void>;
  updateStatus: (id: number, status: string) => Promise<void>;
  placeOrder: (rows: Omit<OrderRow, 'id' | 'created_at'>[]) => Promise<number>;
}

export const useOrdersStore = create<OrdersState>((set, get) => ({
  groups: [],
  loading: false,
  lastFetch: 0,

  load: async () => {
    set({ loading: true });
    try {
      const rows = await fetchOrders();
      set({ groups: groupOrders(rows), lastFetch: Date.now() });
    } finally {
      set({ loading: false });
    }
  },

  updateStatus: async (id, status) => {
    // Optimistic update
    set((s) => ({
      groups: s.groups.map((g) => ({
        ...g,
        items: g.items.map((i) => (i.id === id ? { ...i, status } : i)),
        status: deriveStatus(
          g.items.map((i) => (i.id === id ? { ...i, status } : i)),
        ),
      })),
    }));
    await updateOrderStatus(id, status);
  },

  placeOrder: async (rows) => {
    const orderNumber = await getNextOrderNumber();
    const withNumber = rows.map((r) => ({ ...r, order_number: orderNumber }));
    await insertOrders(withNumber);
    await get().load();
    return orderNumber;
  },
}));
