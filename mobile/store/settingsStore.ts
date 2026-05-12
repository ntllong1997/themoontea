import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface PrinterSettings {
  deviceId: string;
  deviceName: string;
  paperWidth: 32 | 48; // 58mm = 32 chars, 80mm = 48 chars
}

interface SettingsState {
  printer: PrinterSettings | null;
  cashAppTag: string; // e.g. "$TheMoonTea"
  stripePublishableKey: string;
  stripeLocationId: string;
  taxRate: number;
  storeName: string;
  thankYouMessage: string;
  setPrinter: (p: PrinterSettings | null) => void;
  setCashAppTag: (tag: string) => void;
  setStripeKeys: (pub: string, locationId: string) => void;
  setTaxRate: (rate: number) => void;
  setStoreName: (name: string) => void;
  setThankYouMessage: (msg: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      printer: null,
      cashAppTag: process.env.EXPO_PUBLIC_CASHAPP_CASHTAG ?? '$TheMoonTea',
      stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
      stripeLocationId: process.env.EXPO_PUBLIC_STRIPE_TERMINAL_LOCATION_ID ?? '',
      taxRate: 0.0825,
      storeName: 'The Moon Tea',
      thankYouMessage: 'Thank you for your order!',
      setPrinter: (printer) => set({ printer }),
      setCashAppTag: (cashAppTag) => set({ cashAppTag }),
      setStripeKeys: (stripePublishableKey, stripeLocationId) =>
        set({ stripePublishableKey, stripeLocationId }),
      setTaxRate: (taxRate) => set({ taxRate }),
      setStoreName: (storeName) => set({ storeName }),
      setThankYouMessage: (thankYouMessage) => set({ thankYouMessage }),
    }),
    {
      name: 'themoontea-settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
