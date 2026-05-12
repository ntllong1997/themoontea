import { create } from 'zustand';
import { MenuItem, CustomizationOption } from './menuStore';

export interface CartLineItem {
  lineId: string;
  menuItem: MenuItem;
  qty: number;
  selectedOptions: Record<string, CustomizationOption[]>; // groupId → chosen options
  linePrice: number; // unit price including option deltas
  notes: string;
}

interface CartState {
  lines: CartLineItem[];
  addLine: (item: MenuItem, selected: Record<string, CustomizationOption[]>, notes?: string) => void;
  removeLine: (lineId: string) => void;
  updateQty: (lineId: string, qty: number) => void;
  clearCart: () => void;
  subtotal: () => number;
}

function calcLinePrice(item: MenuItem, selected: Record<string, CustomizationOption[]>): number {
  const extras = Object.values(selected)
    .flat()
    .reduce((sum, opt) => sum + opt.priceDelta, 0);
  return item.price + extras;
}

let lineCounter = 0;

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],

  addLine: (menuItem, selectedOptions, notes = '') => {
    const linePrice = calcLinePrice(menuItem, selectedOptions);
    const lineId = `line-${++lineCounter}-${Date.now()}`;
    set((s) => ({
      lines: [...s.lines, { lineId, menuItem, qty: 1, selectedOptions, linePrice, notes }],
    }));
  },

  removeLine: (lineId) =>
    set((s) => ({ lines: s.lines.filter((l) => l.lineId !== lineId) })),

  updateQty: (lineId, qty) => {
    if (qty <= 0) {
      get().removeLine(lineId);
      return;
    }
    set((s) => ({
      lines: s.lines.map((l) => (l.lineId === lineId ? { ...l, qty } : l)),
    }));
  },

  clearCart: () => set({ lines: [] }),

  subtotal: () =>
    get().lines.reduce((sum, l) => sum + l.linePrice * l.qty, 0),
}));
