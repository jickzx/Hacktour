/**
 * ClipOverlay -- floating video player that shows a clip from the library
 * over the live stream. Slides in from left, auto-dismisses when video ends.
 */
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, SPACING, RADII } from "../constants/theme";

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
  const slideAnim = useRef(new Animated.Value(-400)).current;

  const player = useVideoPlayer(clip.sourceVideoUrl || null, (p) => {
    p.play();
  });

  // Auto-dismiss when playback ends
  useEffect(() => {
    let hasPlayed = false;
    const sub = player.addListener("playingChange", (isPlaying) => {
      if (isPlaying) {
        hasPlayed = true;
      } else if (hasPlayed && player.currentTime > 0) {
        setTimeout(handleClose, 800);
      }
    });
    return () => sub.remove();
  }, [player]); // eslint-disable-line

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, []);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: -400,
      duration: 250,
      useNativeDriver: true,
    }).start(onClose);
  };

  const matchPct = Math.round(clip.score * 100);

  return (
    <Animated.View style={[styles.container, { transform: [{ translateX: slideAnim }] }]}>
      <LinearGradient
        colors={["rgba(0,0,0,0.88)", "rgba(12,5,30,0.95)"]}
        style={styles.card}
      >
        <View style={styles.header}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🎬 CLIP</Text>
          </View>
          <Text style={styles.matchText}>{matchPct}% match</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title} numberOfLines={2}>{clip.title}</Text>

        {clip.sourceVideoUrl ? (
          <View style={styles.videoWrap}>
            <VideoView
              player={player}
              style={styles.video}
              contentFit="contain"
              nativeControls={false}
            />
          </View>
        ) : (
          <View style={styles.noVideoWrap}>
            <Text style={styles.noVideoIcon}>▶</Text>
            <Text style={styles.noVideoText}>No video linked</Text>
          </View>
        )}

        <Text style={styles.footer}>{clip.durationSeconds}s</Text>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 110,
    left: SPACING.md,
    width: 240,
    zIndex: 100,
  },
  card: {
    borderRadius: RADII.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
    gap: SPACING.xs,
  },
  badge: {
    backgroundColor: COLORS.accent,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 1 },
  matchText: { fontSize: 10, fontWeight: "700", color: COLORS.accent, flex: 1 },
  closeBtn: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  closeBtnText: { fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: "700" },
  title: {
    fontSize: 13, fontWeight: "700", color: "#fff",
    marginBottom: SPACING.sm, lineHeight: 18,
  },
  videoWrap: {
    borderRadius: RADII.md,
    overflow: "hidden",
    aspectRatio: 9 / 16,
    backgroundColor: "#000",
    marginBottom: SPACING.sm,
  },
  video: { width: "100%", height: "100%" },
  noVideoWrap: {
    borderRadius: RADII.md,
    aspectRatio: 9 / 16,
    backgroundColor: COLORS.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  noVideoIcon: { fontSize: 28, color: COLORS.textMuted },
  noVideoText: { fontSize: 11, color: COLORS.textMuted, marginTop: SPACING.xs },
  footer: { fontSize: 10, color: "rgba(255,255,255,0.35)", textAlign: "right" },
});
