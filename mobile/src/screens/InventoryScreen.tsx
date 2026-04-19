/**
 * InventoryScreen — streamer's live commerce product list.
 * Demo rows: some are order-only, some bid-only (never both); mode toggles are local only.
 */
import { useState, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, SPACING, RADII, WEIGHTS, SAFE_BOTTOM } from "../constants/theme";
import { MOCK_INVENTORY_ITEMS, type MockInventoryRow } from "../data/mockInventory";

interface Props { isFocused?: boolean }

/** Shallow copy so pull-to-refresh can reset demo state without mutating the source. */
function cloneMockList(): MockInventoryRow[] {
  return MOCK_INVENTORY_ITEMS.map((p) => ({
    ...p,
    orders: p.orders.map((o) => ({ ...o })),
    bids: p.bids.map((b) => ({ ...b })),
  }));
}

export default function InventoryScreen({ isFocused }: Props) {
  const [products, setProducts] = useState<MockInventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    // Short beat so the screen doesn’t flash empty — demo data only (no API).
    await new Promise((r) => setTimeout(r, silent ? 0 : 280));
    setProducts(cloneMockList());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { if (isFocused !== false) void load(); }, [isFocused, load]);

  const handleMode = (id: string, mode: "order" | "bid" | "none", channel: MockInventoryRow["salesChannel"]) => {
    if (channel === "order" && mode === "bid") return;
    if (channel === "bid" && mode === "order") return;
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, mode } : p)));
  };

  const renderItem = ({ item }: { item: MockInventoryRow }) => {
    const orderCount = item.orders.reduce((s, o) => s + o.quantity, 0);
    const bidCount = item.bids.length;
    const topBid = item.highestBid;
    const orderOnly = item.salesChannel === "order";
    const bidOnly = item.salesChannel === "bid";

    return (
      <View style={styles.card}>
        {/* ID badge + name */}
        <View style={styles.cardHeader}>
          <View style={styles.idBadge}>
            <Text style={styles.idText}>{item.id}</Text>
          </View>
          <View style={styles.nameBlock}>
            <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.createdAt}>
              {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {" · "}
              <Text style={styles.channelTag}>{orderOnly ? "Orders only" : "Bids only"}</Text>
            </Text>
          </View>
          {item.mode !== "none" && (
            <View style={[styles.statusDot, item.mode === "order" ? styles.dotOrder : styles.dotBid]} />
          )}
        </View>

        {/* Stats: one lane per listing type */}
        {orderOnly ? (
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="cart-outline" size={14} color={COLORS.green} />
              <Text style={styles.statNum}>{orderCount}</Text>
              <Text style={styles.statLabel}>units ordered</Text>
            </View>
          </View>
        ) : (
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="flash-outline" size={14} color={COLORS.warning} />
              <Text style={styles.statNum}>{bidCount}</Text>
              <Text style={styles.statLabel}>bids</Text>
            </View>
            {topBid > 0 && (
              <>
                <View style={styles.divider} />
                <View style={styles.stat}>
                  <Text style={styles.statNum}>£{topBid}</Text>
                  <Text style={styles.statLabel}>top bid</Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* Recent bids (auction lines only) */}
        {bidOnly && item.bids.length > 0 && (
          <View style={styles.bidList}>
            {item.bids.slice(-3).reverse().map((b, i) => (
              <Text key={i} style={styles.bidEntry}>
                <Text style={styles.bidUser}>{b.commenter}</Text> — £{b.amount}
              </Text>
            ))}
          </View>
        )}

        {/* Single control: orders OR bids, never both */}
        <View style={styles.modeRow}>
          {orderOnly ? (
            <TouchableOpacity
              style={[styles.modeBtn, styles.modeBtnFull, item.mode === "order" && styles.modeBtnActive]}
              onPress={() => handleMode(item.id, item.mode === "order" ? "none" : "order", "order")}
              activeOpacity={0.8}
            >
              <Ionicons name="cart-outline" size={13} color={item.mode === "order" ? "#fff" : COLORS.textMuted} />
              <Text style={[styles.modeBtnText, item.mode === "order" && styles.modeBtnTextActive]}>
                {item.mode === "order" ? "Close Orders" : "Open Orders"}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.modeBtn, styles.modeBtnFull, styles.modeBtnBid, item.mode === "bid" && styles.modeBtnBidActive]}
              onPress={() => handleMode(item.id, item.mode === "bid" ? "none" : "bid", "bid")}
              activeOpacity={0.8}
            >
              <Ionicons name="flash-outline" size={13} color={item.mode === "bid" ? "#fff" : COLORS.textMuted} />
              <Text style={[styles.modeBtnText, item.mode === "bid" && styles.modeBtnTextActive]}>
                {item.mode === "bid" ? "Close Bidding" : "Open Bidding"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <LinearGradient colors={["#111113", "#000000"]} style={styles.header}>
        <Text style={styles.headerTitle}>📦 Inventory</Text>
        <Text style={styles.headerSub}>
          {products.length} demo product{products.length !== 1 ? "s" : ""} · sample stats
        </Text>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : products.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyTitle}>Nothing to show</Text>
          <Text style={styles.emptySub}>Pull down to reload the demo list.</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={COLORS.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingTop: 60,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerTitle: { color: COLORS.text, fontSize: 22, fontWeight: WEIGHTS.heavy },
  headerSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  list: { padding: SPACING.md, paddingBottom: SAFE_BOTTOM + 80, gap: SPACING.md },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.md,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.sm, gap: SPACING.sm },
  idBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  idText: { color: "#fff", fontSize: 13, fontWeight: WEIGHTS.heavy, letterSpacing: 1.5 },
  nameBlock: { flex: 1 },
  productName: { color: COLORS.text, fontSize: 14, fontWeight: WEIGHTS.bold },
  createdAt: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  channelTag: { color: COLORS.textSecondary, fontWeight: WEIGHTS.semibold },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  dotOrder: { backgroundColor: COLORS.green },
  dotBid: { backgroundColor: COLORS.warning },
  statsRow: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.sm },
  stat: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: SPACING.sm },
  statNum: { color: COLORS.text, fontSize: 14, fontWeight: WEIGHTS.bold },
  statLabel: { color: COLORS.textMuted, fontSize: 11 },
  divider: { width: 1, height: 16, backgroundColor: COLORS.borderLight },
  bidList: { marginBottom: SPACING.sm },
  bidEntry: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  bidUser: { color: COLORS.warning, fontWeight: WEIGHTS.bold },
  modeRow: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.xs },
  modeBtnFull: { flex: 1 },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modeBtnActive: { backgroundColor: "rgba(52,211,153,0.2)", borderColor: COLORS.green },
  modeBtnBid: {},
  modeBtnBidActive: { backgroundColor: "rgba(251,191,36,0.2)", borderColor: COLORS.warning },
  modeBtnText: { color: COLORS.textMuted, fontSize: 12, fontWeight: WEIGHTS.semibold },
  modeBtnTextActive: { color: COLORS.text },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  emptyIcon: { fontSize: 48, marginBottom: SPACING.md },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: WEIGHTS.bold, marginBottom: SPACING.sm },
  emptySub: { color: COLORS.textMuted, fontSize: 13, textAlign: "center", lineHeight: 20 },
});
