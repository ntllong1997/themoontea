import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useStripeTerminal } from '@stripe/stripe-react-native';
import { useCartStore } from '@/store/cartStore';
import { useOrdersStore } from '@/store/ordersStore';
import { useSettingsStore } from '@/store/settingsStore';
import { buildCashAppLink } from '@/lib/payments';
import { buildReceiptBytes } from '@/lib/receipt';
import { connectToPrinter, printBytes } from '@/lib/bluetooth-printer';
import type { Device } from 'react-native-ble-plx';

type PayMethod = 'tap' | 'cashapp' | 'cash';
type Step = 'choose' | 'tap_processing' | 'cashapp_qr' | 'cash_confirm' | 'done';

const TAX_RATE = 0.0825;

export default function PaymentScreen() {
  const { lines, subtotal, clearCart } = useCartStore();
  const { placeOrder } = useOrdersStore();
  const settings = useSettingsStore();

  const sub = subtotal();
  const tax = sub * TAX_RATE;
  const total = sub + tax;

  const [step, setStep] = useState<Step>('choose');
  const [method, setMethod] = useState<PayMethod>('cashapp');
  const [processing, setProcessing] = useState(false);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const printerDeviceRef = useRef<Device | null>(null);

  const cashAppLink = buildCashAppLink(
    settings.cashAppTag,
    total,
    `Order - The Moon Tea`,
  );

  // ─── Stripe Terminal ──────────────────────────────────────────────────────
  const {
    initialize: initTerminal,
    discoverReaders,
    connectLocalMobileReader,
    createPaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: async (readers) => {
      if (readers.length > 0) {
        await connectLocalMobileReader(readers[0]);
      }
    },
  });

  const processTapToPay = useCallback(async () => {
    setStep('tap_processing');
    setProcessing(true);
    try {
      await initTerminal({
        fetchConnectionToken: async () => {
          // Your backend must return a Stripe Terminal connection token.
          // Implement: POST /api/stripe/connection-token → { secret }
          const res = await fetch(
            `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/stripe-connection-token`,
            { method: 'POST' },
          );
          const json = await res.json();
          return json.secret;
        },
      });

      await discoverReaders({ discoveryMethod: 'localMobile', simulated: false });

      const { paymentIntent, error: piError } = await createPaymentIntent({
        amount: Math.round(total * 100),
        currency: 'usd',
        paymentMethodTypes: ['card_present'],
        captureMethod: 'automatic',
      });
      if (piError) throw new Error(piError.message);

      const { paymentIntent: collected, error: collectError } = await collectPaymentMethod(
        paymentIntent!,
      );
      if (collectError) throw new Error(collectError.message);

      const { error: confirmError } = await confirmPaymentIntent(collected!);
      if (confirmError) throw new Error(confirmError.message);

      await finalizeOrder('Tap to Pay');
    } catch (e: any) {
      Alert.alert('Payment Failed', e.message);
      setStep('choose');
    } finally {
      setProcessing(false);
    }
  }, [total, initTerminal, discoverReaders, createPaymentIntent, collectPaymentMethod, confirmPaymentIntent]);

  // ─── Finalize order ───────────────────────────────────────────────────────
  const finalizeOrder = async (paymentMethod: string) => {
    const rows = lines.map((line) => {
      const opts = Object.values(line.selectedOptions)
        .flat()
        .map((o) => o.label)
        .join(', ');
      return {
        order_number: 0, // filled by placeOrder
        item_name: line.menuItem.name,
        item_type: line.menuItem.category,
        customizations: opts,
        price: line.linePrice * line.qty,
        status: 'new',
        phone: null,
      };
    });

    const num = await placeOrder(rows);
    setOrderNumber(num);
    clearCart();

    await printReceipt(num, paymentMethod);
    setStep('done');
  };

  const printReceipt = async (num: number, paymentMethod: string) => {
    if (!settings.printer) return;
    try {
      const device =
        printerDeviceRef.current ?? (await connectToPrinter(settings.printer.deviceId));
      printerDeviceRef.current = device;

      const receiptItems = lines.map((line) => ({
        name: line.menuItem.name,
        customizations: Object.values(line.selectedOptions).flat().map((o) => o.label).join(', ') || undefined,
        qty: line.qty,
        price: line.linePrice,
      }));

      const bytes = buildReceiptBytes(
        {
          storeName: settings.storeName,
          orderNumber: num,
          items: receiptItems,
          subtotal: sub,
          tax,
          total,
          paymentMethod,
          timestamp: new Date().toLocaleString(),
          thankYouMessage: settings.thankYouMessage,
        },
        settings.printer.paperWidth,
      );

      await printBytes(device, bytes);
    } catch (e: any) {
      Alert.alert('Print Failed', `Could not print receipt: ${e.message}`);
    }
  };

  const handleCashApp = () => {
    setMethod('cashapp');
    setStep('cashapp_qr');
  };

  const handleCashAppPaid = () => finalizeOrder('Cash App').then(() => {});

  const handleCash = () => {
    setMethod('cash');
    setStep('cash_confirm');
  };

  const handleCashConfirm = () => finalizeOrder('Cash').then(() => {});

  // ─── Render ───────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successScreen}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={80} color="#34d399" />
          </View>
          <Text style={styles.successTitle}>Order Placed!</Text>
          <Text style={styles.successOrderNum}>Order #{orderNumber}</Text>
          <Text style={styles.successSub}>
            {settings.printer ? 'Receipt printed.' : 'Receipt ready.'}
          </Text>
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => router.replace('/(tabs)/pos')}
          >
            <Text style={styles.doneBtnText}>New Order</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ordersBtn}
            onPress={() => router.replace('/(tabs)/orders')}
          >
            <Text style={styles.ordersBtnText}>View Orders</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#94a3b8" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Order summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Order Summary</Text>
          {lines.map((line) => {
            const opts = Object.values(line.selectedOptions).flat().map((o) => o.label).join(', ');
            return (
              <View key={line.lineId} style={styles.summaryLine}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryItem}>{line.qty > 1 ? `${line.qty}× ` : ''}{line.menuItem.name}</Text>
                  {opts ? <Text style={styles.summaryOpts}>{opts}</Text> : null}
                </View>
                <Text style={styles.summaryPrice}>${(line.linePrice * line.qty).toFixed(2)}</Text>
              </View>
            );
          })}
          <View style={styles.summaryDivider} />
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalVal}>${sub.toFixed(2)}</Text></View>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Tax (8.25%)</Text><Text style={styles.totalVal}>${tax.toFixed(2)}</Text></View>
          <View style={[styles.totalRow, styles.grandRow]}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandVal}>${total.toFixed(2)}</Text>
          </View>
        </View>

        {/* Payment options — choose step */}
        {step === 'choose' && (
          <>
            <Text style={styles.sectionTitle}>Choose Payment Method</Text>

            {/* Tap to Pay */}
            <TouchableOpacity
              style={[styles.payMethod, method === 'tap' && styles.payMethodActive]}
              onPress={processTapToPay}
            >
              <View style={[styles.payIcon, { backgroundColor: '#3b82f622' }]}>
                <Ionicons name="wifi" size={28} color="#60a5fa" />
              </View>
              <View style={styles.payInfo}>
                <Text style={styles.payTitle}>Tap to Pay</Text>
                <Text style={styles.payDesc}>Contactless NFC via Stripe Terminal</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#475569" />
            </TouchableOpacity>

            {/* Cash App */}
            <TouchableOpacity
              style={[styles.payMethod, method === 'cashapp' && styles.payMethodActive]}
              onPress={handleCashApp}
            >
              <View style={[styles.payIcon, { backgroundColor: '#22c55e22' }]}>
                <Ionicons name="logo-usd" size={28} color="#22c55e" />
              </View>
              <View style={styles.payInfo}>
                <Text style={styles.payTitle}>Cash App</Text>
                <Text style={styles.payDesc}>{settings.cashAppTag} · ${total.toFixed(2)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#475569" />
            </TouchableOpacity>

            {/* Cash */}
            <TouchableOpacity
              style={[styles.payMethod, method === 'cash' && styles.payMethodActive]}
              onPress={handleCash}
            >
              <View style={[styles.payIcon, { backgroundColor: '#fbbf2422' }]}>
                <Ionicons name="cash" size={28} color="#fbbf24" />
              </View>
              <View style={styles.payInfo}>
                <Text style={styles.payTitle}>Cash</Text>
                <Text style={styles.payDesc}>Record a cash payment</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#475569" />
            </TouchableOpacity>
          </>
        )}

        {/* Tap to Pay processing */}
        {step === 'tap_processing' && (
          <View style={styles.processingBox}>
            <ActivityIndicator size="large" color="#60a5fa" />
            <Text style={styles.processingTitle}>Tap to Pay</Text>
            <Text style={styles.processingDesc}>
              Present card or device to the NFC reader on this phone.
            </Text>
            <Text style={styles.processingAmount}>${total.toFixed(2)}</Text>
          </View>
        )}

        {/* Cash App QR */}
        {step === 'cashapp_qr' && (
          <View style={styles.cashAppBox}>
            <Text style={styles.cashAppTitle}>Pay with Cash App</Text>
            <Text style={styles.cashAppAmount}>${total.toFixed(2)}</Text>
            <View style={styles.qrWrapper}>
              <QRCode value={cashAppLink.url} size={220} backgroundColor="#fff" color="#000" />
            </View>
            <Text style={styles.cashAppTag}>{cashAppLink.cashtag}</Text>
            <Text style={styles.cashAppSub}>Scan QR or tap below to open Cash App</Text>

            <TouchableOpacity
              style={styles.openCashAppBtn}
              onPress={() => Linking.openURL(cashAppLink.deepLink).catch(() => Linking.openURL(cashAppLink.url))}
            >
              <Text style={styles.openCashAppText}>Open Cash App</Text>
            </TouchableOpacity>

            <View style={styles.cashAppConfirmRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep('choose')}>
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.paidBtn} onPress={handleCashAppPaid}>
                <Text style={styles.paidBtnText}>Payment Received</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Cash confirm */}
        {step === 'cash_confirm' && (
          <View style={styles.cashBox}>
            <Ionicons name="cash" size={56} color="#fbbf24" />
            <Text style={styles.cashTitle}>Collect Cash Payment</Text>
            <Text style={styles.cashAmount}>${total.toFixed(2)}</Text>
            <View style={styles.cashConfirmRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep('choose')}>
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.paidBtn} onPress={handleCashConfirm}>
                <Text style={styles.paidBtnText}>Mark as Paid</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: '700' },
  scroll: { padding: 16, gap: 16, paddingBottom: 60 },
  // Summary
  summaryCard: { backgroundColor: '#1e293b', borderRadius: 14, padding: 16, gap: 8 },
  summaryTitle: { color: '#f1f5f9', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  summaryItem: { color: '#e2e8f0', fontSize: 14, fontWeight: '500' },
  summaryOpts: { color: '#64748b', fontSize: 12 },
  summaryPrice: { color: '#a78bfa', fontSize: 14, fontWeight: '600' },
  summaryDivider: { height: 1, backgroundColor: '#334155', marginVertical: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { color: '#94a3b8', fontSize: 14 },
  totalVal: { color: '#f1f5f9', fontSize: 14 },
  grandRow: { paddingTop: 8, borderTopWidth: 1, borderTopColor: '#334155', marginTop: 4 },
  grandLabel: { color: '#f1f5f9', fontSize: 18, fontWeight: '700' },
  grandVal: { color: '#a78bfa', fontSize: 20, fontWeight: '700' },
  sectionTitle: { color: '#64748b', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  // Payment methods
  payMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  payMethodActive: { borderColor: '#7c3aed' },
  payIcon: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  payInfo: { flex: 1, gap: 2 },
  payTitle: { color: '#f1f5f9', fontSize: 15, fontWeight: '600' },
  payDesc: { color: '#94a3b8', fontSize: 12 },
  // Tap processing
  processingBox: { alignItems: 'center', gap: 16, paddingVertical: 40, backgroundColor: '#1e293b', borderRadius: 14, padding: 24 },
  processingTitle: { color: '#f1f5f9', fontSize: 20, fontWeight: '700' },
  processingDesc: { color: '#94a3b8', fontSize: 14, textAlign: 'center' },
  processingAmount: { color: '#60a5fa', fontSize: 36, fontWeight: '700' },
  // Cash App
  cashAppBox: { backgroundColor: '#1e293b', borderRadius: 14, padding: 20, alignItems: 'center', gap: 12 },
  cashAppTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: '700' },
  cashAppAmount: { color: '#22c55e', fontSize: 36, fontWeight: '700' },
  qrWrapper: { backgroundColor: '#fff', padding: 16, borderRadius: 16 },
  cashAppTag: { color: '#22c55e', fontSize: 18, fontWeight: '700' },
  cashAppSub: { color: '#94a3b8', fontSize: 13, textAlign: 'center' },
  openCashAppBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  openCashAppText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cashAppConfirmRow: { flexDirection: 'row', gap: 12, width: '100%' },
  // Cash
  cashBox: { backgroundColor: '#1e293b', borderRadius: 14, padding: 24, alignItems: 'center', gap: 16 },
  cashTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: '700' },
  cashAmount: { color: '#fbbf24', fontSize: 40, fontWeight: '700' },
  cashConfirmRow: { flexDirection: 'row', gap: 12, width: '100%' },
  backBtn: { flex: 1, backgroundColor: '#334155', borderRadius: 12, padding: 14, alignItems: 'center' },
  backBtnText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  paidBtn: { flex: 2, backgroundColor: '#7c3aed', borderRadius: 12, padding: 14, alignItems: 'center' },
  paidBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  // Success
  successScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  successIcon: {},
  successTitle: { color: '#f1f5f9', fontSize: 28, fontWeight: '700' },
  successOrderNum: { color: '#a78bfa', fontSize: 20, fontWeight: '600' },
  successSub: { color: '#64748b', fontSize: 14 },
  doneBtn: { backgroundColor: '#7c3aed', borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14, marginTop: 16, width: '100%', alignItems: 'center' },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  ordersBtn: { backgroundColor: '#1e293b', borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14, width: '100%', alignItems: 'center' },
  ordersBtnText: { color: '#94a3b8', fontSize: 16, fontWeight: '600' },
});
