import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMenuStore, MenuItem, CustomizationGroup, CustomizationOption } from '@/store/menuStore';

export default function ItemEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { items, addItem, updateItem } = useMenuStore();

  const existing = id ? items.find((i) => i.id === id) : null;

  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState(existing?.category ?? 'Boba Drinks');
  const [price, setPrice] = useState(String(existing?.price ?? '8.00'));
  const [description, setDescription] = useState(existing?.description ?? '');
  const [trackInventory, setTrackInventory] = useState(existing?.trackInventory ?? false);
  const [inventoryCount, setInventoryCount] = useState(String(existing?.inventoryCount ?? '0'));
  const [active, setActive] = useState(existing?.active ?? true);
  const [groups, setGroups] = useState<CustomizationGroup[]>(existing?.customizationGroups ?? []);

  const CATEGORIES = ['Boba Drinks', 'Corndogs', 'Food', 'Drinks', 'Snacks', 'Other'];

  const addGroup = () => {
    setGroups((g) => [
      ...g,
      {
        id: `grp-${Date.now()}`,
        label: 'New Group',
        required: false,
        multiSelect: false,
        options: [],
      },
    ]);
  };

  const updateGroup = (idx: number, patch: Partial<CustomizationGroup>) => {
    setGroups((g) => g.map((grp, i) => (i === idx ? { ...grp, ...patch } : grp)));
  };

  const removeGroup = (idx: number) => {
    setGroups((g) => g.filter((_, i) => i !== idx));
  };

  const addOption = (grpIdx: number) => {
    setGroups((g) =>
      g.map((grp, i) =>
        i === grpIdx
          ? {
              ...grp,
              options: [
                ...grp.options,
                { id: `opt-${Date.now()}`, label: 'Option', priceDelta: 0 },
              ],
            }
          : grp,
      ),
    );
  };

  const updateOption = (grpIdx: number, optIdx: number, patch: Partial<CustomizationOption>) => {
    setGroups((g) =>
      g.map((grp, i) =>
        i === grpIdx
          ? {
              ...grp,
              options: grp.options.map((o, j) => (j === optIdx ? { ...o, ...patch } : o)),
            }
          : grp,
      ),
    );
  };

  const removeOption = (grpIdx: number, optIdx: number) => {
    setGroups((g) =>
      g.map((grp, i) =>
        i === grpIdx ? { ...grp, options: grp.options.filter((_, j) => j !== optIdx) } : grp,
      ),
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Item name is required.');
      return;
    }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      Alert.alert('Validation', 'Enter a valid price.');
      return;
    }
    const parsedCount = parseInt(inventoryCount, 10);

    const payload = {
      name: name.trim(),
      category,
      price: parsedPrice,
      description: description.trim(),
      active,
      trackInventory,
      inventoryCount: isNaN(parsedCount) ? 0 : parsedCount,
      imageUrl: existing?.imageUrl ?? null,
      customizationGroups: groups,
    };

    if (existing) {
      await updateItem({ ...existing, ...payload });
    } else {
      await addItem(payload);
    }
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#94a3b8" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{existing ? 'Edit Item' : 'New Item'}</Text>
        <TouchableOpacity onPress={handleSave}>
          <Text style={styles.saveLink}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Basic info */}
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Name *</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Item name" placeholderTextColor="#475569" />

          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            <View style={styles.catRow}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.catBtn, category === c && styles.catBtnActive]}
                  onPress={() => setCategory(c)}
                >
                  <Text style={[styles.catBtnText, category === c && styles.catBtnTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.label}>Price ($)</Text>
          <TextInput
            style={styles.input}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor="#475569"
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, { minHeight: 60 }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Optional description"
            placeholderTextColor="#475569"
            multiline
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Active (visible in POS)</Text>
            <Switch
              value={active}
              onValueChange={setActive}
              trackColor={{ false: '#334155', true: '#7c3aed' }}
              thumbColor={active ? '#a78bfa' : '#64748b'}
            />
          </View>
        </View>

        {/* Inventory */}
        <Text style={styles.sectionTitle}>Inventory</Text>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Track Inventory</Text>
            <Switch
              value={trackInventory}
              onValueChange={setTrackInventory}
              trackColor={{ false: '#334155', true: '#7c3aed' }}
              thumbColor={trackInventory ? '#a78bfa' : '#64748b'}
            />
          </View>
          {trackInventory && (
            <>
              <Text style={styles.label}>Current Stock</Text>
              <TextInput
                style={styles.input}
                value={inventoryCount}
                onChangeText={setInventoryCount}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#475569"
              />
            </>
          )}
        </View>

        {/* Customizations */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Customizations</Text>
          <TouchableOpacity style={styles.addGroupBtn} onPress={addGroup}>
            <Ionicons name="add" size={16} color="#a78bfa" />
            <Text style={styles.addGroupText}>Add Group</Text>
          </TouchableOpacity>
        </View>

        {groups.map((group, grpIdx) => (
          <View key={group.id} style={styles.groupCard}>
            <View style={styles.groupHeader}>
              <TextInput
                style={styles.groupNameInput}
                value={group.label}
                onChangeText={(v) => updateGroup(grpIdx, { label: v })}
                placeholder="Group name"
                placeholderTextColor="#475569"
              />
              <TouchableOpacity onPress={() => removeGroup(grpIdx)}>
                <Ionicons name="trash" size={18} color="#ef4444" />
              </TouchableOpacity>
            </View>

            <View style={styles.groupFlags}>
              <View style={styles.switchRow}>
                <Text style={styles.flagLabel}>Required</Text>
                <Switch
                  value={group.required}
                  onValueChange={(v) => updateGroup(grpIdx, { required: v })}
                  trackColor={{ false: '#334155', true: '#7c3aed' }}
                  thumbColor={group.required ? '#a78bfa' : '#64748b'}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.flagLabel}>Multi-select</Text>
                <Switch
                  value={group.multiSelect}
                  onValueChange={(v) => updateGroup(grpIdx, { multiSelect: v })}
                  trackColor={{ false: '#334155', true: '#7c3aed' }}
                  thumbColor={group.multiSelect ? '#a78bfa' : '#64748b'}
                />
              </View>
            </View>

            {group.options.map((opt, optIdx) => (
              <View key={opt.id} style={styles.optRow}>
                <TextInput
                  style={[styles.input, { flex: 2 }]}
                  value={opt.label}
                  onChangeText={(v) => updateOption(grpIdx, optIdx, { label: v })}
                  placeholder="Option label"
                  placeholderTextColor="#475569"
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={String(opt.priceDelta)}
                  onChangeText={(v) => updateOption(grpIdx, optIdx, { priceDelta: parseFloat(v) || 0 })}
                  keyboardType="decimal-pad"
                  placeholder="+$0"
                  placeholderTextColor="#475569"
                />
                <TouchableOpacity onPress={() => removeOption(grpIdx, optIdx)}>
                  <Ionicons name="close-circle" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.addOptBtn} onPress={() => addOption(grpIdx)}>
              <Ionicons name="add" size={14} color="#94a3b8" />
              <Text style={styles.addOptText}>Add Option</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={{ height: 40 }} />
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
  saveLink: { color: '#a78bfa', fontSize: 16, fontWeight: '700' },
  scroll: { padding: 16, gap: 12 },
  sectionTitle: { color: '#64748b', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { backgroundColor: '#1e293b', borderRadius: 14, padding: 16, gap: 10 },
  label: { color: '#94a3b8', fontSize: 13, fontWeight: '500' },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    color: '#f1f5f9',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  catRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  catBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: '#334155' },
  catBtnActive: { backgroundColor: '#7c3aed' },
  catBtnText: { color: '#64748b', fontSize: 13 },
  catBtnTextActive: { color: '#fff', fontWeight: '600' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchLabel: { color: '#e2e8f0', fontSize: 14 },
  addGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#4c1d9533',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addGroupText: { color: '#a78bfa', fontSize: 13, fontWeight: '600' },
  groupCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, gap: 10 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupNameInput: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    color: '#f1f5f9',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  groupFlags: { gap: 6 },
  flagLabel: { color: '#94a3b8', fontSize: 13 },
  optRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addOptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  addOptText: { color: '#64748b', fontSize: 13 },
});
