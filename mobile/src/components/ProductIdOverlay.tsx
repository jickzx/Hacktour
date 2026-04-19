/**
 * ProductIdOverlay — top-right corner card shown after "hey panda id this".
 * Displays the product name, its short ID, and lets the streamer open
 * ordering or bidding. Auto-dismisses after 12 s unless the streamer acts.
 */
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { InventoryProduct } from "../services/api";

interface Props {
  product: InventoryProduct;
  onOpenOrder: () => void;
  onOpenBid: () => void;
  onClose: () => void;
}

const AUTO_DISMISS_MS = 12000;

export default function ProductIdOverlay({ product, onOpenOrder, onOpenBid, onClose }: Props) {
  const slideAnim = useRef(new Animated.Value(-220)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -220, duration: 220, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const modeLabel = product.mode === "order"
    ? "🛒 Orders open"
    : product.mode === "bid"
    ? "⚡ Bidding open"
    : null;

  return (
    <Animated.View
      style={[
        styles.card,
        { transform: [{ translateX: slideAnim }], opacity: opacityAnim },
      ]}
      pointerEvents="box-none"
    >
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.idBadge}>
          <Text style={styles.idText}>{product.id}</Text>
        </View>
        <Text numberOfLines={1} style={styles.name}>{product.name}</Text>
        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={16} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>

      {modeLabel && (
        <Text style={styles.modeLabel}>{modeLabel}</Text>
      )}

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.btnOrder, product.mode === "order" && styles.btnActive]}
          onPress={() => { onOpenOrder(); dismiss(); }}
          activeOpacity={0.8}
        >
          <Ionicons name="cart-outline" size={14} color="#fff" />
          <Text style={styles.btnText}>Order</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnBid, product.mode === "bid" && styles.btnActive]}
          onPress={() => { onOpenBid(); dismiss(); }}
          activeOpacity={0.8}
        >
          <Ionicons name="flash-outline" size={14} color="#fff" />
          <Text style={styles.btnText}>Bid</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>Viewers type: order {product.id} or bid £50 {product.id}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    top: 110,
    right: 12,
    width: 200,
    backgroundColor: "rgba(9,9,11,0.92)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  idBadge: {
    backgroundColor: "#FF2442",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  idText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  name: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  modeLabel: {
    color: "#a3e635",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 6,
  },
  actions: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 7,
    borderRadius: 8,
  },
  btnOrder: { backgroundColor: "rgba(34,197,94,0.25)", borderWidth: 1, borderColor: "rgba(34,197,94,0.5)" },
  btnBid: { backgroundColor: "rgba(251,146,60,0.25)", borderWidth: 1, borderColor: "rgba(251,146,60,0.5)" },
  btnActive: { opacity: 0.5 },
  btnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  hint: {
    color: "rgba(255,255,255,0.38)",
    fontSize: 9,
    lineHeight: 13,
  },
});
