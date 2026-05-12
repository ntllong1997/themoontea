import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMenuStore, MenuItem } from '@/store/menuStore';

function MenuItemRow({ item }: { item: MenuItem }) {
  const { updateItem, removeItem } = useMenuStore();

  const handleDelete = () => {
    Alert.alert('Delete Item', `Remove "${item.name}" from the menu?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => removeItem(item.id),
      },
    ]);
  };

  return (
    <View style={styles.itemRow}>
      <View style={styles.itemLeft}>
        <View style={styles.itemIcon}>
          <Ionicons
            name={item.category === 'Boba Drinks' ? 'cafe' : 'restaurant'}
            size={20}
            color="#a78bfa"
          />
        </View>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemCat}>{item.category}</Text>
          {item.trackInventory && (
            <Text style={[styles.itemStock, { color: item.inventoryCount > 5 ? '#34d399' : '#f87171' }]}>
              Stock: {item.inventoryCount}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.itemRight}>
        <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>
        <Switch
          value={item.active}
          onValueChange={(v) => updateItem({ ...item, active: v })}
          trackColor={{ false: '#334155', true: '#7c3aed' }}
          thumbColor={item.active ? '#a78bfa' : '#64748b'}
        />
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/item-editor', params: { id: item.id } })}
        >
          <Ionicons name="pencil" size={18} color="#94a3b8" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDelete}>
          <Ionicons name="trash" size={18} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function MenuScreen() {
  const { items, categories } = useMenuStore();
  const [activeCategory, setActiveCategory] = useState('All');

  const cats = ['All', ...categories()];
  const filtered =
    activeCategory === 'All' ? items : items.filter((i) => i.category === activeCategory);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Menu</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/item-editor')}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Add Item</Text>
        </TouchableOpacity>
      </View>

      {/* Category filter */}
      <View style={styles.catRow}>
        {cats.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.catBtn, activeCategory === c && styles.catBtnActive]}
            onPress={() => setActiveCategory(c)}
          >
            <Text style={[styles.catBtnText, activeCategory === c && styles.catBtnTextActive]}>
              {c}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="restaurant-outline" size={48} color="#334155" />
            <Text style={styles.emptyText}>No items</Text>
          </View>
        }
        renderItem={({ item }) => <MenuItemRow item={item} />}
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#7c3aed',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  catRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  catBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  catBtnActive: { backgroundColor: '#4c1d95' },
  catBtnText: { color: '#64748b', fontSize: 13, fontWeight: '500' },
  catBtnTextActive: { color: '#a78bfa', fontWeight: '700' },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { color: '#64748b', fontSize: 16 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  itemLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4c1d9533',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  itemCat: { color: '#64748b', fontSize: 12 },
  itemStock: { fontSize: 12, fontWeight: '500' },
  itemRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemPrice: { color: '#a78bfa', fontSize: 15, fontWeight: '700' },
});
