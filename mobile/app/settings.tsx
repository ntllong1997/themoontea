import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '@/store/settingsStore';
import {
  scanForPrinters,
  connectToPrinter,
  disconnectPrinter,
  waitForBlePoweredOn,
  PrinterDevice,
} from '@/lib/bluetooth-printer';

type Section = 'printer' | 'payment' | 'store';

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={styles.settingValue}>{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const {
    printer,
    cashAppTag,
    stripePublishableKey,
    stripeLocationId,
    storeName,
    thankYouMessage,
    setPrinter,
    setCashAppTag,
    setStripeKeys,
    setStoreName,
    setThankYouMessage,
  } = useSettingsStore();

  const [section, setSection] = useState<Section>('printer');
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [foundDevices, setFoundDevices] = useState<PrinterDevice[]>([]);
  const [stopScan, setStopScan] = useState<(() => void) | null>(null);

  // Local edit state
  const [cashTag, setCashTag] = useState(cashAppTag);
  const [stripePub, setStripePub] = useState(stripePublishableKey);
  const [stripeLoc, setStripeLoc] = useState(stripeLocationId);
  const [storeNameDraft, setStoreNameDraft] = useState(storeName);
  const [thankYouDraft, setThankYouDraft] = useState(thankYouMessage);

  const startScan = useCallback(async () => {
    setFoundDevices([]);
    setScanning(true);
    try {
      await waitForBlePoweredOn();
      const stop = scanForPrinters(
        (device) => setFoundDevices((prev) => {
          if (prev.some((d) => d.id === device.id)) return prev;
          return [...prev, device];
        }),
        (err) => Alert.alert('Scan Error', err.message),
        8000,
      );
      setStopScan(() => stop);
      setTimeout(() => setScanning(false), 8000);
    } catch (e: any) {
      setScanning(false);
      Alert.alert('Bluetooth Error', e.message);
    }
  }, []);

  const stopScanning = () => {
    stopScan?.();
    setScanning(false);
  };

  const handleConnect = async (device: PrinterDevice) => {
    setConnecting(device.id);
    try {
      await connectToPrinter(device.id);
      setPrinter({ deviceId: device.id, deviceName: device.name, paperWidth: 32 });
      Alert.alert('Connected', `Printer "${device.name}" connected!`);
    } catch (e: any) {
      Alert.alert('Connection Failed', e.message);
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async () => {
    if (!printer) return;
    try {
      await disconnectPrinter(printer.deviceId);
    } catch {}
    setPrinter(null);
  };

  const savePayment = () => {
    setCashAppTag(cashTag);
    setStripeKeys(stripePub, stripeLoc);
    Alert.alert('Saved', 'Payment settings saved.');
  };

  const saveStore = () => {
    setStoreName(storeNameDraft);
    setThankYouMessage(thankYouDraft);
    Alert.alert('Saved', 'Store settings saved.');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#94a3b8" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Section tabs */}
      <View style={styles.tabRow}>
        {(['printer', 'payment', 'store'] as Section[]).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.tab, section === s && styles.tabActive]}
            onPress={() => setSection(s)}
          >
            <Text style={[styles.tabText, section === s && styles.tabTextActive]}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ─── Printer ───────────────────────────────────── */}
        {section === 'printer' && (
          <>
            <SectionHeader title="Bluetooth Printer" />

            {printer ? (
              <View style={styles.card}>
                <View style={styles.connectedRow}>
                  <Ionicons name="print" size={24} color="#34d399" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.connectedName}>{printer.deviceName}</Text>
                    <Text style={styles.connectedSub}>Connected · {printer.paperWidth === 32 ? '58mm' : '80mm'}</Text>
                  </View>
                  <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
                    <Text style={styles.disconnectText}>Disconnect</Text>
                  </TouchableOpacity>
                </View>

                <Row label="Paper Width">
                  <View style={styles.paperRow}>
                    {([32, 48] as const).map((w) => (
                      <TouchableOpacity
                        key={w}
                        style={[styles.paperBtn, printer.paperWidth === w && styles.paperBtnActive]}
                        onPress={() => setPrinter({ ...printer, paperWidth: w })}
                      >
                        <Text style={[styles.paperBtnText, printer.paperWidth === w && styles.paperBtnTextActive]}>
                          {w === 32 ? '58mm' : '80mm'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </Row>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.cardDesc}>
                  Scan for nearby Bluetooth printers. Make sure the printer is powered on and in pairing mode.
                </Text>
                <TouchableOpacity
                  style={[styles.scanBtn, scanning && styles.scanBtnActive]}
                  onPress={scanning ? stopScanning : startScan}
                >
                  {scanning && <ActivityIndicator size="small" color="#fff" />}
                  <Text style={styles.scanBtnText}>
                    {scanning ? 'Scanning… (tap to stop)' : 'Scan for Printers'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {foundDevices.length > 0 && (
              <>
                <SectionHeader title="Found Devices" />
                {foundDevices.map((d) => (
                  <View key={d.id} style={styles.deviceRow}>
                    <Ionicons name="print-outline" size={20} color="#94a3b8" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deviceName}>{d.name}</Text>
                      <Text style={styles.deviceId}>{d.id} {d.rssi ? `· ${d.rssi} dBm` : ''}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.connectBtn}
                      onPress={() => handleConnect(d)}
                      disabled={connecting === d.id}
                    >
                      {connecting === d.id
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.connectBtnText}>Connect</Text>}
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* ─── Payment ───────────────────────────────────── */}
        {section === 'payment' && (
          <>
            <SectionHeader title="Cash App" />
            <View style={styles.card}>
              <Text style={styles.cardDesc}>
                Customers will see a QR code / link to pay via Cash App.
              </Text>
              <Text style={styles.inputLabel}>Cash App Tag</Text>
              <TextInput
                style={styles.input}
                value={cashTag}
                onChangeText={setCashTag}
                placeholder="$YourCashTag"
                placeholderTextColor="#475569"
                autoCapitalize="none"
              />
            </View>

            <SectionHeader title="Stripe Terminal (Tap to Pay)" />
            <View style={styles.card}>
              <Text style={styles.cardDesc}>
                Enables contactless NFC payments. Requires a Stripe account and Terminal integration.
              </Text>
              <Text style={styles.inputLabel}>Publishable Key</Text>
              <TextInput
                style={styles.input}
                value={stripePub}
                onChangeText={setStripePub}
                placeholder="pk_live_..."
                placeholderTextColor="#475569"
                autoCapitalize="none"
              />
              <Text style={styles.inputLabel}>Terminal Location ID</Text>
              <TextInput
                style={styles.input}
                value={stripeLoc}
                onChangeText={setStripeLoc}
                placeholder="tml_..."
                placeholderTextColor="#475569"
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={savePayment}>
              <Text style={styles.saveBtnText}>Save Payment Settings</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ─── Store ─────────────────────────────────────── */}
        {section === 'store' && (
          <>
            <SectionHeader title="Store Info" />
            <View style={styles.card}>
              <Text style={styles.inputLabel}>Store Name</Text>
              <TextInput
                style={styles.input}
                value={storeNameDraft}
                onChangeText={setStoreNameDraft}
                placeholder="The Moon Tea"
                placeholderTextColor="#475569"
              />
              <Text style={styles.inputLabel}>Receipt Thank-You Message</Text>
              <TextInput
                style={[styles.input, { minHeight: 60 }]}
                value={thankYouDraft}
                onChangeText={setThankYouDraft}
                placeholder="Thank you for your order!"
                placeholderTextColor="#475569"
                multiline
              />
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={saveStore}>
              <Text style={styles.saveBtnText}>Save Store Settings</Text>
            </TouchableOpacity>
          </>
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
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  tabActive: { backgroundColor: '#4c1d95' },
  tabText: { color: '#64748b', fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: '#a78bfa', fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 60, gap: 12 },
  sectionHeader: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 8,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  cardDesc: { color: '#94a3b8', fontSize: 13, lineHeight: 19 },
  connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  connectedName: { color: '#f1f5f9', fontSize: 15, fontWeight: '600' },
  connectedSub: { color: '#94a3b8', fontSize: 12 },
  disconnectBtn: {
    backgroundColor: '#ef444422',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  disconnectText: { color: '#ef4444', fontSize: 13, fontWeight: '600' },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLabel: { color: '#94a3b8', fontSize: 14 },
  settingValue: {},
  paperRow: { flexDirection: 'row', gap: 8 },
  paperBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#334155',
  },
  paperBtnActive: { backgroundColor: '#7c3aed' },
  paperBtnText: { color: '#64748b', fontSize: 13 },
  paperBtnTextActive: { color: '#fff', fontWeight: '600' },
  scanBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    padding: 14,
  },
  scanBtnActive: { backgroundColor: '#334155' },
  scanBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  deviceName: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  deviceId: { color: '#64748b', fontSize: 11 },
  connectBtn: {
    backgroundColor: '#7c3aed',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  connectBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  inputLabel: { color: '#94a3b8', fontSize: 13, fontWeight: '500', marginBottom: 4 },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    color: '#f1f5f9',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  saveBtn: {
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
