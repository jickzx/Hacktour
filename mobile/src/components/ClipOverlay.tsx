/**
 * ClipOverlay -- floating video player in a Modal so it renders above the
 * camera layer on iOS (separate UIWindow = no AVFoundation conflict).
 * Draggable, no text/border chrome, close button only.
 */
import { useEffect, useRef, useCallback } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CARD_W = 220;
const CARD_H = Math.round(CARD_W * 16 / 9);

interface ClipData {
  id: string;
  title: string;
  sourceVideoUrl: string;
  durationSeconds: number;
  score: number;
}

interface Props {
  clip: ClipData;
  onClose: () => void;
}

export default function ClipOverlay({ clip, onClose }: Props) {
  const initX = (SCREEN_W - CARD_W) / 2;
  const initY = (SCREEN_H - CARD_H) / 2;

  const pan = useRef(new Animated.ValueXY({ x: initX, y: initY })).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  const player = useVideoPlayer(clip.sourceVideoUrl || null, (p) => {
    p.loop = false;
    p.play();
  });

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 0.7, duration: 200, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  }, [onClose]); // eslint-disable-line

  // Auto-dismiss when playback ends
  useEffect(() => {
    let hasPlayed = false;
    const sub = player.addListener("playingChange", (e: any) => {
      const playing = typeof e === "boolean" ? e : e?.isPlaying;
      if (playing) {
        hasPlayed = true;
      } else if (hasPlayed && player.currentTime > 0) {
        setTimeout(handleClose, 800);
      }
    });
    return () => sub.remove();
  }, [player, handleClose]);

  // Pop-in animation
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, []); // eslint-disable-line

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
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.modalBackdrop} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
          {...panResponder.panHandlers}
        >
          <VideoView
            player={player}
            style={styles.video}
            contentFit="cover"
            nativeControls={false}
          />
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
  },
  card: {
    position: "absolute",
    top: 0,
    left: 0,
    width: CARD_W,
    height: CARD_H,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  video: { width: "100%", height: "100%" },
  closeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: { fontSize: 13, color: "#fff", fontWeight: "700" },
});
