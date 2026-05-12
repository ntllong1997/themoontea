import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as crypto from 'expo-crypto';
import {
  fetchMenuItems,
  upsertMenuItem,
  deleteMenuItem,
  adjustInventory,
  MenuItemRow,
} from '@/lib/supabase';

export type CustomizationOption = { id: string; label: string; priceDelta: number };
export type CustomizationGroup = {
  id: string;
  label: string;
  required: boolean;
  multiSelect: boolean;
  options: CustomizationOption[];
};

export interface MenuItem {
  id: string;
  category: string;
  name: string;
  price: number;
  description: string;
  active: boolean;
  inventoryCount: number;
  trackInventory: boolean;
  imageUrl: string | null;
  sortOrder: number;
  customizationGroups: CustomizationGroup[];
}

// Default boba shop seed data (matches existing web app)
const DEFAULT_ITEMS: MenuItem[] = [
  {
    id: 'boba-classic',
    category: 'Boba Drinks',
    name: 'Classic Milk Tea',
    price: 8.0,
    description: 'Black tea with milk, your choice of boba',
    active: true,
    inventoryCount: 99,
    trackInventory: false,
    imageUrl: null,
    sortOrder: 0,
    customizationGroups: [
      {
        id: 'boba',
        label: 'Boba Topping',
        required: true,
        multiSelect: false,
        options: [
          { id: 'tapioca', label: 'Tapioca', priceDelta: 0 },
          { id: 'popping', label: 'Popping Boba', priceDelta: 0 },
          { id: 'jelly', label: 'Coconut Jelly', priceDelta: 0 },
          { id: 'none', label: 'No Boba', priceDelta: 0 },
        ],
      },
    ],
  },
  {
    id: 'boba-taro',
    category: 'Boba Drinks',
    name: 'Taro Milk Tea',
    price: 8.0,
    description: 'Creamy taro with milk tea',
    active: true,
    inventoryCount: 99,
    trackInventory: false,
    imageUrl: null,
    sortOrder: 1,
    customizationGroups: [
      {
        id: 'boba',
        label: 'Boba Topping',
        required: true,
        multiSelect: false,
        options: [
          { id: 'tapioca', label: 'Tapioca', priceDelta: 0 },
          { id: 'popping', label: 'Popping Boba', priceDelta: 0 },
          { id: 'jelly', label: 'Coconut Jelly', priceDelta: 0 },
          { id: 'none', label: 'No Boba', priceDelta: 0 },
        ],
      },
    ],
  },
  {
    id: 'boba-matcha',
    category: 'Boba Drinks',
    name: 'Matcha Latte',
    price: 8.0,
    description: 'Japanese matcha with creamy milk',
    active: true,
    inventoryCount: 99,
    trackInventory: false,
    imageUrl: null,
    sortOrder: 2,
    customizationGroups: [
      {
        id: 'boba',
        label: 'Boba Topping',
        required: true,
        multiSelect: false,
        options: [
          { id: 'tapioca', label: 'Tapioca', priceDelta: 0 },
          { id: 'popping', label: 'Popping Boba', priceDelta: 0 },
          { id: 'jelly', label: 'Coconut Jelly', priceDelta: 0 },
          { id: 'none', label: 'No Boba', priceDelta: 0 },
        ],
      },
    ],
  },
  {
    id: 'corndog-classic',
    category: 'Corndogs',
    name: 'Classic Corndog',
    price: 8.0,
    description: 'Golden fried corndog',
    active: true,
    inventoryCount: 30,
    trackInventory: true,
    imageUrl: null,
    sortOrder: 10,
    customizationGroups: [
      {
        id: 'filling',
        label: 'Filling',
        required: true,
        multiSelect: false,
        options: [
          { id: 'hotdog', label: 'Hot Dog', priceDelta: 0 },
          { id: 'mozz', label: 'Mozzarella', priceDelta: 0 },
        ],
      },
      {
        id: 'coating',
        label: 'Coating',
        required: true,
        multiSelect: false,
        options: [
          { id: 'corn', label: 'Corn Batter', priceDelta: 0 },
          { id: 'panko', label: 'Panko', priceDelta: 0 },
          { id: 'ramen', label: 'Ramen Noodle', priceDelta: 0 },
        ],
      },
      {
        id: 'extras',
        label: 'Add-ons',
        required: false,
        multiSelect: true,
        options: [{ id: 'cheeto', label: 'Hot Cheeto Dust', priceDelta: 1.0 }],
      },
    ],
  },
];

function rowToItem(row: MenuItemRow): MenuItem {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    price: row.price,
    description: row.description,
    active: row.active,
    inventoryCount: row.inventory_count,
    trackInventory: row.track_inventory,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
    customizationGroups: JSON.parse(row.customization_groups || '[]'),
  };
}

function itemToRow(item: MenuItem): Omit<MenuItemRow, 'created_at'> {
  return {
    id: item.id,
    category: item.category,
    name: item.name,
    price: item.price,
    description: item.description,
    active: item.active,
    inventory_count: item.inventoryCount,
    track_inventory: item.trackInventory,
    image_url: item.imageUrl,
    sort_order: item.sortOrder,
    customization_groups: JSON.stringify(item.customizationGroups),
  };
}

interface MenuState {
  items: MenuItem[];
  loading: boolean;
  loadItems: () => Promise<void>;
  addItem: (item: Omit<MenuItem, 'id' | 'sortOrder'>) => Promise<void>;
  updateItem: (item: MenuItem) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  adjustCount: (id: string, delta: number) => Promise<void>;
  categories: () => string[];
}

export const useMenuStore = create<MenuState>()(
  persist(
    (set, get) => ({
      items: DEFAULT_ITEMS,
      loading: false,

      loadItems: async () => {
        set({ loading: true });
        try {
          const rows = await fetchMenuItems();
          if (rows.length > 0) {
            set({ items: rows.map(rowToItem) });
          }
        } catch {
          // Offline – keep cached items
        } finally {
          set({ loading: false });
        }
      },

      addItem: async (partial) => {
        const id = await crypto.randomUUID();
        const sortOrder = get().items.length;
        const item: MenuItem = { ...partial, id, sortOrder };
        set((s) => ({ items: [...s.items, item] }));
        try {
          await upsertMenuItem(itemToRow(item));
        } catch {
          // Optimistic – already in local state
        }
      },

      updateItem: async (item) => {
        set((s) => ({ items: s.items.map((i) => (i.id === item.id ? item : i)) }));
        try {
          await upsertMenuItem(itemToRow(item));
        } catch {}
      },

      removeItem: async (id) => {
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
        try {
          await deleteMenuItem(id);
        } catch {}
      },

      adjustCount: async (id, delta) => {
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, inventoryCount: Math.max(0, i.inventoryCount + delta) } : i,
          ),
        }));
        try {
          await adjustInventory(id, delta);
        } catch {}
      },

      categories: () => {
        const cats = new Set(get().items.map((i) => i.category));
        return Array.from(cats);
      },
    }),
    {
      name: 'themoontea-menu',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
