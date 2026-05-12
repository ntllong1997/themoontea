import { Linking } from 'react-native';

// ─── Cash App ────────────────────────────────────────────────────────────────

export interface CashAppPaymentLink {
  url: string;
  deepLink: string;
  amount: number;
  cashtag: string;
}

export function buildCashAppLink(cashtag: string, amount: number, note?: string): CashAppPaymentLink {
  const tag = cashtag.startsWith('$') ? cashtag.slice(1) : cashtag;
  const amountFixed = amount.toFixed(2);
  const noteParam = note ? `&note=${encodeURIComponent(note)}` : '';
  const url = `https://cash.app/$${tag}/${amountFixed}${noteParam}`;
  const deepLink = `cashapp://cash.app/pay?amount=${amountFixed}&to=$${tag}${noteParam}`;
  return { url, deepLink, amount, cashtag: `$${tag}` };
}

export async function openCashApp(link: CashAppPaymentLink): Promise<void> {
  const canDeepLink = await Linking.canOpenURL(link.deepLink);
  if (canDeepLink) {
    await Linking.openURL(link.deepLink);
  } else {
    await Linking.openURL(link.url);
  }
}

// ─── Stripe Terminal (Tap to Pay) ────────────────────────────────────────────
// The actual Stripe Terminal integration requires the @stripe/stripe-react-native
// SDK wrapped around your app in _layout.tsx, and a backend endpoint that
// creates a ConnectionToken. This module wraps the SDK calls with error handling.

import {
  useStripeTerminal,
  Reader,
  PaymentIntent,
} from '@stripe/stripe-react-native';

export const TAX_RATE = 0.0825;

export function calculateTotals(subtotal: number): {
  subtotal: number;
  tax: number;
  total: number;
} {
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

// cents for Stripe
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export type PaymentMethod = 'tap_to_pay' | 'cash_app' | 'cash';

export interface PaymentResult {
  method: PaymentMethod;
  amountCents: number;
  stripePaymentIntentId?: string;
  cashAppLink?: CashAppPaymentLink;
  completedAt: string;
}
