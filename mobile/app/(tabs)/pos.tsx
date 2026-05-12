import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMenuStore, MenuItem, CustomizationGroup, CustomizationOption } from '@/store/menuStore';
import { useCartStore } from '@/store/cartStore';

// ─── Category pill ────────────────────────────────────────────────────────────
function CategoryPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.catPill, active && styles.catPillActive]}
      onPress={onPress}
    >
      <Text style={[styles.catPillText, active && styles.catPillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Menu item card ───────────────────────────────────────────────────────────
function MenuCard({ item, onPress }: { item: MenuItem; onPress: () => void }) {
  const soldOut = item.trackInventory && item.inventoryCount <= 0;
  return (
    <TouchableOpacity
      style={[styles.menuCard, soldOut && styles.menuCardSoldOut]}
      onPress={soldOut ? undefined : onPress}
      activeOpacity={soldOut ? 1 : 0.7}
    >
      <View style={styles.menuCardTop}>
        <View style={[styles.menuIcon, { backgroundColor: categoryColor(item.category) + '22' }]}>
          <Ionicons name={categoryIcon(item.category)} size={24} color={categoryColor(item.category)} />
        </View>
        {soldOut && (
          <View style={styles.soldOutBadge}>
            <Text style={styles.soldOutText}>Sold Out</Text>
          </View>
        )}
      </View>
      <Text style={styles.menuName}>{item.name}</Text>
      {item.description ? <Text style={styles.menuDesc} numberOfLines={2}>{item.description}</Text> : null}
      <Text style={styles.menuPrice}>${item.price.toFixed(2)}</Text>
      {item.trackInventory && (
        <Text style={[styles.menuStock, { color: item.inventoryCount > 5 ? '#34d399' : '#f87171' }]}>
          {item.inventoryCount} left
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Customization modal ──────────────────────────────────────────────────────
function CustomizationModal({
  item,
  visible,
  onClose,
  onAdd,
}: {
  item: MenuItem | null;
  visible: boolean;
  onClose: () => void;
  onAdd: (item: MenuItem, selected: Record<string, CustomizationOption[]>, notes: string) => void;
}) {
  const [selected, setSelected] = useState<Record<string, CustomizationOption[]>>({});
  const [notes, setNotes] = useState('');

  const toggle = (group: CustomizationGroup, opt: CustomizationOption) => {
    setSelected((prev) => {
      const cur = prev[group.id] ?? [];
      if (group.multiSelect) {
        const exists = cur.some((o) => o.id === opt.id);
        return {
          ...prev,
          [group.id]: exists ? cur.filter((o) => o.id !== opt.id) : [...cur, opt],
        };
      }
      return { ...prev, [group.id]: [opt] };
    });
  };

  const isSelected = (groupId: string, optId: string) =>
    (selected[groupId] ?? []).some((o) => o.id === optId);

  const canAdd = () => {
    if (!item) return false;
    return item.customizationGroups
      .filter((g) => g.required)
      .every((g) => (selected[g.id] ?? []).length > 0);
  };

  const handleAdd = () => {
    if (!item || !canAdd()) return;
    onAdd(item, selected, notes);
    setSelected({});
    setNotes('');
    onClose();
  };

  const extraPrice = Object.values(selected)
    .flat()
    .reduce((sum, o) => sum + o.priceDelta, 0);

  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{item.name}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalPrice}>
            ${(item.price + extraPrice).toFixed(2)}
            {extraPrice > 0 && <Text style={styles.extraNote}> (+${extraPrice.toFixed(2)} extras)</Text>}
          </Text>

          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
            {item.customizationGroups.map((group) => (
              <View key={group.id} style={styles.custGroup}>
                <View style={styles.custGroupHeader}>
                  <Text style={styles.custGroupLabel}>{group.label}</Text>
                  {group.required && (
                    <View style={styles.requiredBadge}>
                      <Text style={styles.requiredText}>Required</Text>
                    </View>
                  )}
                </View>
                {group.options.map((opt) => {
                  const sel = isSelected(group.id, opt.id);
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.optRow, sel && styles.optRowSelected]}
                      onPress={() => toggle(group, opt)}
                    >
                      <View style={[styles.optRadio, sel && styles.optRadioSelected]}>
                        {sel && <View style={styles.optRadioInner} />}
                      </View>
                      <Text style={[styles.optLabel, sel && styles.optLabelSelected]}>{opt.label}</Text>
                      {opt.priceDelta > 0 && (
                        <Text style={styles.optPrice}>+${opt.priceDelta.toFixed(2)}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            <View style={styles.notesGroup}>
              <Text style={styles.custGroupLabel}>Special Notes</Text>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Any special requests..."
                placeholderTextColor="#475569"
                multiline
              />
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.addBtn, !canAdd() && styles.addBtnDisabled]}
            onPress={handleAdd}
            disabled={!canAdd()}
          >
            <Text style={styles.addBtnText}>Add to Cart — ${(item.price + extraPrice).toFixed(2)}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Cart drawer ──────────────────────────────────────────────────────────────
function CartDrawer({
  visible,
  onClose,
  onCheckout,
}: {
  visible: boolean;
  onClose: () => void;
  onCheckout: () => void;
}) {
  const { lines, removeLine, updateQty, clearCart, subtotal } = useCartStore();
  const tax = subtotal() * 0.0825;
  const total = subtotal() + tax;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { maxHeight: '85%' }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Cart ({lines.reduce((n, l) => n + l.qty, 0)} items)</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {lines.length === 0 ? (
            <View style={styles.emptyCart}>
              <Ionicons name="cart-outline" size={48} color="#334155" />
              <Text style={styles.emptyCartText}>Cart is empty</Text>
            </View>
          ) : (
            <>
              <FlatList
                data={lines}
                keyExtractor={(l) => l.lineId}
                style={{ maxHeight: 320 }}
                renderItem={({ item: line }) => {
                  const opts = Object.values(line.selectedOptions).flat().map((o) => o.label).join(', ');
                  return (
                    <View style={styles.cartLine}>
                      <View style={styles.cartLineInfo}>
                        <Text style={styles.cartLineName}>{line.menuItem.name}</Text>
                        {opts ? <Text style={styles.cartLineOpts}>{opts}</Text> : null}
                        {line.notes ? <Text style={styles.cartLineNotes}>{line.notes}</Text> : null}
                      </View>
                      <View style={styles.cartLineRight}>
                        <View style={styles.qtyRow}>
                          <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(line.lineId, line.qty - 1)}>
                            <Ionicons name="remove" size={16} color="#f1f5f9" />
                          </TouchableOpacity>
                          <Text style={styles.qtyText}>{line.qty}</Text>
                          <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(line.lineId, line.qty + 1)}>
                            <Ionicons name="add" size={16} color="#f1f5f9" />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.cartLinePrice}>${(line.linePrice * line.qty).toFixed(2)}</Text>
                      </View>
                    </View>
                  );
                }}
              />

              <View style={styles.cartTotals}>
                <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalValue}>${subtotal().toFixed(2)}</Text></View>
                <View style={styles.totalRow}><Text style={styles.totalLabel}>Tax (8.25%)</Text><Text style={styles.totalValue}>${tax.toFixed(2)}</Text></View>
                <View style={[styles.totalRow, styles.totalRowBold]}>
                  <Text style={styles.totalLabelBold}>Total</Text>
                  <Text style={styles.totalValueBold}>${total.toFixed(2)}</Text>
                </View>
              </View>

              <View style={styles.cartActions}>
                <TouchableOpacity style={styles.clearBtn} onPress={clearCart}>
                  <Text style={styles.clearBtnText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.checkoutBtn} onPress={onCheckout}>
                  <Text style={styles.checkoutBtnText}>Checkout — ${total.toFixed(2)}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Main POS screen ──────────────────────────────────────────────────────────
export default function POSScreen() {
  const { items, categories } = useMenuStore();
  const { addLine, lines, subtotal } = useCartStore();
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [showCust, setShowCust] = useState(false);

  const cats = ['All', ...categories()];
  const filtered = activeCategory === 'All'
    ? items.filter((i) => i.active)
    : items.filter((i) => i.active && i.category === activeCategory);

  const cartCount = lines.reduce((n, l) => n + l.qty, 0);

  const handleMenuPress = useCallback((item: MenuItem) => {
    if (item.customizationGroups.length > 0) {
      setSelectedItem(item);
      setShowCust(true);
    } else {
      addLine(item, {}, '');
    }
  }, [addLine]);

  const handleCheckout = () => {
    setShowCart(false);
    router.push('/payment');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>POS</Text>
        <TouchableOpacity style={styles.cartButton} onPress={() => setShowCart(true)}>
          <Ionicons name="cart" size={22} color="#f1f5f9" />
          {cartCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount}</Text>
            </View>
          )}
          {subtotal() > 0 && (
            <Text style={styles.cartTotal}>${subtotal().toFixed(2)}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Category filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catBar}
      >
        {cats.map((c) => (
          <CategoryPill key={c} label={c} active={activeCategory === c} onPress={() => setActiveCategory(c)} />
        ))}
      </ScrollView>

      {/* Menu grid */}
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <MenuCard item={item} onPress={() => handleMenuPress(item)} />
        )}
      />

      <CustomizationModal
        item={selectedItem}
        visible={showCust}
        onClose={() => { setShowCust(false); setSelectedItem(null); }}
        onAdd={addLine}
      />

      <CartDrawer
        visible={showCart}
        onClose={() => setShowCart(false)}
        onCheckout={handleCheckout}
      />
    </SafeAreaView>
  );
}

function categoryColor(cat: string): string {
  const map: Record<string, string> = {
    'Boba Drinks': '#a78bfa',
    Corndogs: '#fbbf24',
    Food: '#fb923c',
    Drinks: '#60a5fa',
  };
  return map[cat] ?? '#94a3b8';
}

function categoryIcon(cat: string): React.ComponentProps<typeof Ionicons>['name'] {
  const map: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
    'Boba Drinks': 'cafe',
    Corndogs: 'restaurant',
    Food: 'fast-food',
    Drinks: 'wine',
  };
  return map[cat] ?? 'grid';
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
  cartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    position: 'relative',
  },
  cartBadge: {
    backgroundColor: '#7c3aed',
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cartTotal: { color: '#a78bfa', fontSize: 14, fontWeight: '700' },
  catBar: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  catPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#1e293b',
  },
  catPillActive: { backgroundColor: '#7c3aed' },
  catPillText: { color: '#94a3b8', fontSize: 13, fontWeight: '500' },
  catPillTextActive: { color: '#fff', fontWeight: '700' },
  grid: { padding: 12, paddingBottom: 40 },
  gridRow: { gap: 12, marginBottom: 12 },
  menuCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  menuCardSoldOut: { opacity: 0.5 },
  menuCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  menuIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  soldOutBadge: { backgroundColor: '#ef444433', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  soldOutText: { color: '#ef4444', fontSize: 10, fontWeight: '700' },
  menuName: { color: '#f1f5f9', fontSize: 14, fontWeight: '700' },
  menuDesc: { color: '#64748b', fontSize: 11 },
  menuPrice: { color: '#a78bfa', fontSize: 16, fontWeight: '700' },
  menuStock: { fontSize: 11 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    minHeight: 300,
  },
  modalHandle: { width: 40, height: 4, backgroundColor: '#334155', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { color: '#f1f5f9', fontSize: 20, fontWeight: '700' },
  modalPrice: { color: '#a78bfa', fontSize: 22, fontWeight: '700', marginBottom: 16 },
  extraNote: { color: '#94a3b8', fontSize: 14 },
  modalScroll: { flexGrow: 0, maxHeight: 400 },
  custGroup: { marginBottom: 20 },
  custGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  custGroupLabel: { color: '#f1f5f9', fontSize: 15, fontWeight: '600' },
  requiredBadge: { backgroundColor: '#7c3aed33', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  requiredText: { color: '#a78bfa', fontSize: 11, fontWeight: '600' },
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#1e293b',
  },
  optRowSelected: { backgroundColor: '#4c1d9533', borderWidth: 1, borderColor: '#7c3aed' },
  optRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#475569',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optRadioSelected: { borderColor: '#a78bfa' },
  optRadioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#a78bfa' },
  optLabel: { flex: 1, color: '#94a3b8', fontSize: 14 },
  optLabelSelected: { color: '#f1f5f9', fontWeight: '600' },
  optPrice: { color: '#a78bfa', fontSize: 13 },
  notesGroup: { marginBottom: 16 },
  notesInput: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    color: '#f1f5f9',
    fontSize: 14,
    minHeight: 60,
    marginTop: 8,
  },
  addBtn: {
    backgroundColor: '#7c3aed',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  addBtnDisabled: { backgroundColor: '#334155' },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Cart
  emptyCart: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyCartText: { color: '#64748b', fontSize: 16 },
  cartLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  cartLineInfo: { flex: 1, gap: 2 },
  cartLineName: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  cartLineOpts: { color: '#94a3b8', fontSize: 12 },
  cartLineNotes: { color: '#64748b', fontSize: 11, fontStyle: 'italic' },
  cartLineRight: { alignItems: 'flex-end', gap: 6 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyText: { color: '#f1f5f9', fontSize: 14, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  cartLinePrice: { color: '#a78bfa', fontSize: 14, fontWeight: '700' },
  cartTotals: { paddingVertical: 12, gap: 6 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalRowBold: { paddingTop: 8, borderTopWidth: 1, borderTopColor: '#1e293b' },
  totalLabel: { color: '#94a3b8', fontSize: 14 },
  totalValue: { color: '#f1f5f9', fontSize: 14 },
  totalLabelBold: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  totalValueBold: { color: '#a78bfa', fontSize: 18, fontWeight: '700' },
  cartActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  clearBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  clearBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '600' },
  checkoutBtn: {
    flex: 2,
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  checkoutBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
