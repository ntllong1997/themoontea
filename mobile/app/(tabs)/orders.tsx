import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useOrdersStore, GroupedOrder } from '@/store/ordersStore';

type Filter = 'all' | 'new' | 'making' | 'ready' | 'picked up';

const STATUS_FLOW: Record<string, string> = {
  new: 'making',
  making: 'ready',
  ready: 'picked up',
};

const STATUS_COLOR: Record<string, string> = {
  new: '#a78bfa',
  making: '#fbbf24',
  ready: '#34d399',
  'picked up': '#64748b',
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? '#94a3b8';
  return (
    <View style={[styles.badge, { backgroundColor: color + '22' }]}>
      <Text style={[styles.badgeText, { color }]}>{status.toUpperCase()}</Text>
    </View>
  );
}

function OrderCard({ group }: { group: GroupedOrder }) {
  const { updateStatus } = useOrdersStore();
  const nextStatus = STATUS_FLOW[group.status];

  const advance = useCallback(() => {
    if (!nextStatus) return;
    group.items.forEach((item) => {
      if (item.status === group.status) {
        updateStatus(item.id, nextStatus);
      }
    });
  }, [group, nextStatus, updateStatus]);

  const timeAgo = (() => {
    const diff = Date.now() - new Date(group.createdAt).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  })();

  return (
    <View style={styles.orderCard}>
      <View style={styles.orderCardHeader}>
        <View style={styles.orderCardLeft}>
          <Text style={styles.orderNum}>Order #{group.orderNumber}</Text>
          <Text style={styles.orderTime}>{timeAgo}</Text>
        </View>
        <StatusBadge status={group.status} />
      </View>

      {group.items.map((item) => (
        <View key={item.id} style={styles.itemRow}>
          <View style={styles.itemDot} />
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.item_name}</Text>
            {item.customizations ? (
              <Text style={styles.itemCustom}>{item.customizations}</Text>
            ) : null}
          </View>
          <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>
        </View>
      ))}

      <View style={styles.orderCardFooter}>
        <Text style={styles.orderTotal}>
          Total: ${group.items.reduce((s, i) => s + i.price, 0).toFixed(2)}
        </Text>
        {group.phone && (
          <Text style={styles.orderPhone}>📞 {group.phone}</Text>
        )}
        {nextStatus && (
          <TouchableOpacity style={styles.advanceBtn} onPress={advance}>
            <Text style={styles.advanceBtnText}>
              Mark {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}
            </Text>
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function OrdersScreen() {
  const { groups, loading, load } = useOrdersStore();
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, [load]);

  const filters: Filter[] = ['all', 'new', 'making', 'ready', 'picked up'];
  const filtered = filter === 'all' ? groups : groups.filter((g) => g.status === filter);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Orders</Text>
        <Text style={styles.headerCount}>{groups.filter((g) => g.status !== 'picked up').length} active</Text>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && { backgroundColor: (STATUS_COLOR[f] ?? '#7c3aed') + '33', borderColor: STATUS_COLOR[f] ?? '#7c3aed' }]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[styles.filterText, filter === f && { color: STATUS_COLOR[f] ?? '#a78bfa' }]}
            >
              {f === 'all' ? 'All' : f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(g) => String(g.orderNumber)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor="#a78bfa" />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={48} color="#334155" />
            <Text style={styles.emptyText}>No orders</Text>
          </View>
        }
        renderItem={({ item: group }) => <OrderCard group={group} />}
      />
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
  headerTitle: { color: '#f1f5f9', fontSize: 22, fontWeight: '700' },
  headerCount: { color: '#a78bfa', fontSize: 14, fontWeight: '600' },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
  },
  filterText: { color: '#64748b', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  list: { padding: 12, gap: 12, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { color: '#64748b', fontSize: 16 },
  orderCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  orderCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderCardLeft: { gap: 2 },
  orderNum: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  orderTime: { color: '#64748b', fontSize: 12 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#475569', marginTop: 6 },
  itemInfo: { flex: 1 },
  itemName: { color: '#e2e8f0', fontSize: 14, fontWeight: '500' },
  itemCustom: { color: '#64748b', fontSize: 12 },
  itemPrice: { color: '#a78bfa', fontSize: 14, fontWeight: '600' },
  orderCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  orderTotal: { color: '#f1f5f9', fontSize: 14, fontWeight: '700' },
  orderPhone: { color: '#64748b', fontSize: 12 },
  advanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#7c3aed',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  advanceBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
