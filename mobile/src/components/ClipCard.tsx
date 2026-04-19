/**
 * ClipCard — XHS-style post card for a saved clip.
 */
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS, FONT_SIZES, RADII, SPACING, WEIGHTS, SHADOWS } from "../constants/theme";

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

export interface ClipCardProps {
  title: string;
  prompt: string;
  durationSeconds: number;
  createdAt: string;
  sourceVideoUrl?: string;
  thumbnailUrl?: string;
  onPress?: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ClipCard({
  title,
  durationSeconds,
  createdAt,
  sourceVideoUrl,
  thumbnailUrl,
  onPress,
}: ClipCardProps) {
  const thumbUri = thumbnailUrl
    ? (thumbnailUrl.startsWith("http") ? thumbnailUrl : `${API_BASE}${thumbnailUrl}`)
    : null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.thumb}>
        {thumbUri ? (
          <Image source={{ uri: thumbUri }} style={styles.thumbImg} resizeMode="cover" />
        ) : null}
        <View style={styles.playOverlay}>
          <View style={styles.playCircle}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </View>
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(durationSeconds)}</Text>
        </View>
        {sourceVideoUrl ? (
          <View style={styles.linkedBadge}>
            <Text style={styles.linkedText}>LINKED</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <View style={styles.meta}>
        <View style={styles.avatar} />
        <Text style={styles.time} numberOfLines={1}>
          {relativeTime(createdAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADII.lg,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
    ...SHADOWS.card,
  },
  thumb: {
    aspectRatio: 9 / 16,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: RADII.lg,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbImg: {
    ...StyleSheet.absoluteFillObject,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
  },
  playIcon: {
    fontSize: 18,
    color: "#fff",
    marginLeft: 2,
  },
  durationBadge: {
    position: "absolute",
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  durationText: {
    color: "#FFFFFF",
    fontSize: FONT_SIZES.xs,
    fontWeight: WEIGHTS.bold,
    letterSpacing: 0.4,
  },
  linkedBadge: {
    position: "absolute",
    bottom: SPACING.sm,
    left: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  linkedText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: WEIGHTS.bold,
    letterSpacing: 0.8,
  },
  title: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: WEIGHTS.medium,
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
    lineHeight: 18,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.sm,
    gap: SPACING.xs + 2,
  },
  avatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.surfaceLight,
  },
  time: {
    flex: 1,
    fontSize: FONT_SIZES.xs + 1,
    color: COLORS.textSecondary,
    fontWeight: WEIGHTS.regular,
  },
});
