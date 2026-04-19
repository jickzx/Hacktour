/** ProductOverlay -- floating mini browser for shopping links above the camera. */
import { useEffect, useRef, useCallback } from "react";
import {
  Animated,
  Dimensions,
  Linking,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CARD_W = 250;
const CARD_H = 320;

interface ProductData {
  title: string;
  price?: string;
  store?: string;
  url: string;
  displayUrl: string;
  summary: string;
}

interface Props {
  item: ProductData;
  onClose: () => void;
}

export default function ProductOverlay({ item, onClose }: Props) {
  const initX = SCREEN_W - CARD_W - 18;
  const initY = Math.max(120, (SCREEN_H - CARD_H) / 2 - 20);

  const pan = useRef(new Animated.ValueXY({ x: initX, y: initY })).current;
  const scaleAnim = useRef(new Animated.Value(0.84)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 0.78, duration: 160, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(() => onClose());
  }, [onClose]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 90, friction: 10 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => { pan.flattenOffset(); },
    })
  ).current;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <View style={styles.modalBackdrop} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          <View style={styles.dragHandle} {...panResponder.panHandlers}>
            <View style={styles.grabber} />
            <View style={styles.headerCopy}>
              <Text numberOfLines={1} style={styles.title}>{item.title}</Text>
              <Text numberOfLines={1} style={styles.meta}>
                {[item.store, item.price].filter(Boolean).join(" • ") || item.displayUrl}
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <WebView
            source={{ uri: item.url }}
            style={styles.webview}
            setSupportMultipleWindows={false}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
          />

          <TouchableOpacity style={styles.buyBtn} activeOpacity={0.85} onPress={() => Linking.openURL(item.url)}>
            <Text style={styles.buyBtnText}>Open Product</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1 },
  card: {
    position: "absolute",
    top: 0,
    left: 0,
    width: CARD_W,
    height: CARD_H,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#0b0b10",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  dragHandle: {
    height: 54,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(6,6,10,0.96)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  grabber: {
    width: 4,
    height: 22,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginRight: 10,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: "#fff", fontSize: 13, fontWeight: "800" },
  meta: { color: "rgba(255,255,255,0.62)", fontSize: 11, marginTop: 2 },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  closeText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  webview: { flex: 1, backgroundColor: "#fff" },
  buyBtn: {
    height: 42,
    backgroundColor: "#FF2442",
    alignItems: "center",
    justifyContent: "center",
  },
  buyBtnText: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
});
