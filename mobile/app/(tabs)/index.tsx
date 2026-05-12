import { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOrdersStore } from '@/store/ordersStore';
import { useCartStore } from '@/store/cartStore';
import { useSettingsStore } from '@/store/settingsStore';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function StatCard({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: IoniconsName }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress, color = '#7c3aed' }: { icon: IoniconsName; label: string; onPress: () => void; color?: string }) {
  return (
    <TouchableOpacity style={[styles.quickAction, { borderColor: color }]} onPress={onPress}>
      <View style={[styles.qaIcon, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      <Text style={styles.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const { groups, loading, load } = useOrdersStore();
  const cartLines = useCartStore((s) => s.lines);
  const storeName = useSettingsStore((s) => s.storeName);
  const printer = useSettingsStore((s) => s.printer);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  const todayOrders = groups.filter((g) => {
    const d = new Date(g.createdAt);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  });

  const activeOrders = groups.filter((g) => g.status !== 'picked up').slice(0, 5);
  const todayRevenue = todayOrders.reduce(
    (sum, g) => sum + g.items.reduce((s, i) => s + i.price, 0),
    0,
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{storeName}</Text>
          <Text style={styles.headerSub}>POS Dashboard</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/settings')} style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={24} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#a78bfa" />}
      >
        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatCard label="Today Orders" value={todayOrders.length} color="#a78bfa" icon="receipt-outline" />
          <StatCard label="Active" value={activeOrders.length} color="#34d399" icon="time-outline" />
          <StatCard label="Today Revenue" value={`$${todayRevenue.toFixed(0)}`} color="#fbbf24" icon="cash-outline" />
          <StatCard label="Cart Items" value={cartLines.reduce((n, l) => n + l.qty, 0)} color="#60a5fa" icon="cart-outline" />
        </View>

        {/* Printer status */}
        <View style={styles.printerRow}>
          <Ionicons
            name={printer ? 'print' : 'print-outline'}
            size={16}
            color={printer ? '#34d399' : '#ef4444'}
          />
          <Text style={[styles.printerText, { color: printer ? '#34d399' : '#ef4444' }]}>
            {printer ? `Printer: ${printer.deviceName}` : 'No printer connected'}
          </Text>
          {!printer && (
            <TouchableOpacity onPress={() => router.push('/settings')}>
              <Text style={styles.connectLink}>Connect</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.qaGrid}>
          <QuickAction icon="cart" label="New Order" onPress={() => router.push('/(tabs)/pos')} />
          <QuickAction icon="receipt" label="Orders" onPress={() => router.push('/(tabs)/orders')} color="#34d399" />
          <QuickAction icon="restaurant" label="Menu" onPress={() => router.push('/(tabs)/menu')} color="#fbbf24" />
          <QuickAction icon="cube" label="Inventory" onPress={() => router.push('/(tabs)/inventory')} color="#60a5fa" />
        </View>

        {/* Active orders */}
        {activeOrders.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Active Orders</Text>
            {activeOrders.map((g) => (
              <TouchableOpacity
                key={g.orderNumber}
                style={styles.orderRow}
                onPress={() => router.push('/(tabs)/orders')}
              >
                <View style={styles.orderLeft}>
                  <Text style={styles.orderNum}>#{g.orderNumber}</Text>
                  <Text style={styles.orderItems}>
                    {g.items.map((i) => i.item_name).join(', ')}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(g.status) + '33' }]}>
                  <Text style={[styles.statusText, { color: statusColor(g.status) }]}>
                    {g.status}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case 'new': return '#a78bfa';
    case 'making': return '#fbbf24';
    case 'ready': return '#34d399';
    case 'picked up': return '#64748b';
    default: return '#94a3b8';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: { color: '#f1f5f9', fontSize: 22, fontWeight: '700' },
  headerSub: { color: '#94a3b8', fontSize: 13 },
  settingsBtn: { padding: 8 },
  scroll: { padding: 16, paddingBottom: 40 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    gap: 4,
  },
  statValue: { color: '#f1f5f9', fontSize: 22, fontWeight: '700' },
  statLabel: { color: '#94a3b8', fontSize: 12 },
  printerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  printerText: { flex: 1, fontSize: 13 },
  connectLink: { color: '#a78bfa', fontSize: 13, fontWeight: '600' },
  sectionTitle: { color: '#94a3b8', fontSize: 13, fontWeight: '600', marginBottom: 10, marginTop: 4 },
  qaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  quickAction: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1e293b',
  },
  qaIcon: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  qaLabel: { color: '#f1f5f9', fontSize: 13, fontWeight: '600' },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  orderLeft: { flex: 1, gap: 2 },
  orderNum: { color: '#f1f5f9', fontSize: 15, fontWeight: '700' },
  orderItems: { color: '#94a3b8', fontSize: 12 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
});
