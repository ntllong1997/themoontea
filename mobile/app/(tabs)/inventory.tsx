import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMenuStore, MenuItem } from '@/store/menuStore';

function InventoryRow({ item }: { item: MenuItem }) {
  const { adjustCount, updateItem } = useMenuStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(item.inventoryCount));

  const save = () => {
    const n = parseInt(draft, 10);
    if (!isNaN(n)) {
      const delta = n - item.inventoryCount;
      adjustCount(item.id, delta);
    } else {
      setDraft(String(item.inventoryCount));
    }
    setEditing(false);
  };

  const stockColor =
    !item.trackInventory
      ? '#94a3b8'
      : item.inventoryCount === 0
      ? '#ef4444'
      : item.inventoryCount <= 5
      ? '#fbbf24'
      : '#34d399';

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={[styles.dot, { backgroundColor: stockColor }]} />
        <View>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowCat}>{item.category}</Text>
        </View>
      </View>

      {item.trackInventory ? (
        <View style={styles.rowRight}>
          <TouchableOpacity
            style={styles.adjBtn}
            onPress={() => adjustCount(item.id, -1)}
          >
            <Ionicons name="remove" size={16} color="#f1f5f9" />
          </TouchableOpacity>

          {editing ? (
            <TextInput
              style={styles.countInput}
              value={draft}
              onChangeText={setDraft}
              onBlur={save}
              onSubmitEditing={save}
              keyboardType="numeric"
              autoFocus
            />
          ) : (
            <TouchableOpacity onPress={() => { setDraft(String(item.inventoryCount)); setEditing(true); }}>
              <Text style={[styles.countText, { color: stockColor }]}>{item.inventoryCount}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.adjBtn}
            onPress={() => adjustCount(item.id, 1)}
          >
            <Ionicons name="add" size={16} color="#f1f5f9" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.rowRight}>
          <TouchableOpacity
            onPress={() => updateItem({ ...item, trackInventory: true })}
          >
            <Text style={styles.trackLink}>Track</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function InventoryScreen() {
  const { items } = useMenuStore();
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [search, setSearch] = useState('');

  const tracked = items.filter((i) => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === 'low') return i.trackInventory && i.inventoryCount > 0 && i.inventoryCount <= 10;
    if (filter === 'out') return i.trackInventory && i.inventoryCount === 0;
    return true;
  });

  const outCount = items.filter((i) => i.trackInventory && i.inventoryCount === 0).length;
  const lowCount = items.filter((i) => i.trackInventory && i.inventoryCount > 0 && i.inventoryCount <= 10).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Inventory</Text>
      </View>

      {/* Summary pills */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryNum}>{items.filter((i) => i.trackInventory).length}</Text>
          <Text style={styles.summaryLabel}>Tracked</Text>
        </View>
        <View style={[styles.summaryPill, { borderColor: '#fbbf24' }]}>
          <Text style={[styles.summaryNum, { color: '#fbbf24' }]}>{lowCount}</Text>
          <Text style={styles.summaryLabel}>Low Stock</Text>
        </View>
        <View style={[styles.summaryPill, { borderColor: '#ef4444' }]}>
          <Text style={[styles.summaryNum, { color: '#ef4444' }]}>{outCount}</Text>
          <Text style={styles.summaryLabel}>Out of Stock</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color="#64748b" />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search items..."
          placeholderTextColor="#475569"
        />
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(['all', 'low', 'out'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'all' ? 'All Items' : f === 'low' ? 'Low Stock' : 'Out of Stock'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={tracked}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={48} color="#334155" />
            <Text style={styles.emptyText}>No items found</Text>
          </View>
        }
        renderItem={({ item }) => <InventoryRow item={item} />}
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
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  summaryPill: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 2,
  },
  summaryNum: { color: '#a78bfa', fontSize: 20, fontWeight: '700' },
  summaryLabel: { color: '#64748b', fontSize: 11 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: '#f1f5f9', fontSize: 14 },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 8,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  filterBtnActive: { backgroundColor: '#4c1d95' },
  filterText: { color: '#64748b', fontSize: 12, fontWeight: '500' },
  filterTextActive: { color: '#a78bfa', fontWeight: '700' },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { color: '#64748b', fontSize: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
  },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowName: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  rowCat: { color: '#64748b', fontSize: 12 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adjBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countText: { fontSize: 18, fontWeight: '700', minWidth: 36, textAlign: 'center' },
  countInput: {
    backgroundColor: '#0f172a',
    color: '#a78bfa',
    fontSize: 18,
    fontWeight: '700',
    minWidth: 50,
    textAlign: 'center',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  trackLink: { color: '#a78bfa', fontSize: 13, fontWeight: '600' },
});
