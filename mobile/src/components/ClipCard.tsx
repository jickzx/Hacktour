/**
 * ClipCard — displays a single saved clip in the library grid
 */
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS, RADII, SPACING } from "../constants/theme";

/** Props for the ClipCard component */
export interface ClipCardProps {
  title: string;
  prompt: string;
  durationSeconds: number;
  createdAt: string;
  sourceVideoUrl?: string;
  onPress?: () => void;
}

/** Formats seconds into m:ss string (e.g. 90 → "1:30") */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Returns a human-readable relative time string from an ISO timestamp */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * ClipCard — card component for a single clip in the 2-per-row library grid.
 * Width is controlled by the parent FlatList column layout.
 */
export default function ClipCard({ title, durationSeconds, createdAt, onPress }: ClipCardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      {/* Thumbnail area with play icon and duration badge */}
      <View style={styles.thumbnail}>
        <Text style={styles.playIcon}>▶</Text>
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(durationSeconds)}</Text>
        </View>
      </View>

      {/* Clip info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <Text style={styles.time}>{relativeTime(createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    overflow: "hidden",
  },
  thumbnail: {
    aspectRatio: 9 / 16,
    backgroundColor: COLORS.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: {
    fontSize: 28,
    color: COLORS.textSecondary,
  },
  durationBadge: {
    position: "absolute",
    top: SPACING.xs,
    right: SPACING.xs,
    backgroundColor: COLORS.primary,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
  durationText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "600",
  },
  info: {
    padding: SPACING.sm,
    gap: 4,
  },
  title: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
  },
  time: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
});
