/**
 * PollOverlay — live poll that floats over the stream, auto-votes via AI reactions
 */
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS, SPACING, RADII, WEIGHTS } from "../constants/theme";

interface Props {
  question: string;
  options: string[];
  onClose: () => void;
  /** Fires when new AI comments arrive so we can auto-tally votes */
  latestComment?: string;
}

export default function PollOverlay({ question, options, onClose, latestComment }: Props) {
  const [votes, setVotes] = useState<number[]>(() => options.map(() => 0));
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const totalVotes = votes.reduce((a, b) => a + b, 0);

  // Slide in on mount
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, []);

  // Auto-close after 30s
  useEffect(() => {
    const t = setTimeout(() => handleClose(), 5000);
    return () => clearTimeout(t);
  }, []);

  // Parse incoming AI comments and tally votes
  useEffect(() => {
    if (!latestComment) return;
    const lower = latestComment.toLowerCase();
    options.forEach((opt, i) => {
      if (lower.includes(opt.toLowerCase())) {
        setVotes(prev => {
          const next = [...prev];
          next[i] += 1;
          return next;
        });
      }
    });
  }, [latestComment]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: -300,
      duration: 250,
      useNativeDriver: true,
    }).start(onClose);
  };

  const pct = (i: number) =>
    totalVotes === 0 ? 0 : Math.round((votes[i] / totalVotes) * 100);

  const winnerIdx = votes.indexOf(Math.max(...votes));

  return (
    <Animated.View style={[styles.container, { transform: [{ translateX: slideAnim }] }]}>
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.pollBadge}>
            <Text style={styles.pollBadgeText}>📊 POLL</Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Question */}
        <Text style={styles.question}>{question}</Text>

        {/* Options */}
        {options.map((opt, i) => {
          const p = pct(i);
          const isWinning = totalVotes > 0 && i === winnerIdx;
          return (
            <View key={opt} style={styles.optionWrap}>
              <View style={styles.optionRow}>
                <Text style={[styles.optionLabel, isWinning && styles.optionLabelWinning]}>
                  {opt}
                </Text>
                <Text style={[styles.optionPct, isWinning && styles.optionPctWinning]}>
                  {p}%
                </Text>
              </View>
              <View style={styles.barBg}>
                <Animated.View
                  style={[
                    styles.barFill,
                    { width: `${p}%` as any },
                    isWinning && styles.barFillWinning,
                  ]}
                />
              </View>
            </View>
          );
        })}

        {/* Footer */}
        <Text style={styles.footer}>
          {totalVotes} vote{totalVotes !== 1 ? "s" : ""} · reacting live
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 110,
    left: SPACING.md,
    width: 220,
    zIndex: 100,
  },
  card: {
    borderRadius: RADII.lg,
    padding: SPACING.md,
    backgroundColor: "rgba(0,0,0,0.82)",
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  pollBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  pollBadgeText: {
    fontSize: 10,
    fontWeight: WEIGHTS.heavy,
    color: "#fff",
    letterSpacing: 1,
  },
  closeBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: { fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: WEIGHTS.bold },
  question: {
    fontSize: 13,
    fontWeight: WEIGHTS.bold,
    color: "#fff",
    marginBottom: SPACING.md,
    lineHeight: 18,
  },
  optionWrap: { marginBottom: SPACING.sm },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: WEIGHTS.semibold,
    color: "rgba(255,255,255,0.75)",
  },
  optionLabelWinning: { color: "#fff" },
  optionPct: {
    fontSize: 12,
    fontWeight: WEIGHTS.bold,
    color: "rgba(255,255,255,0.5)",
  },
  optionPctWinning: { color: COLORS.accent },
  barBg: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: COLORS.primaryLight,
    borderRadius: 3,
  },
  barFillWinning: { backgroundColor: COLORS.accent },
  footer: {
    fontSize: 10,
    color: "rgba(255,255,255,0.35)",
    marginTop: SPACING.sm,
    textAlign: "right",
  },
});
