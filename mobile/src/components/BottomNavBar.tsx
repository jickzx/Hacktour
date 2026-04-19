/**
 * BottomNavBar — XHS-style 5-slot tab bar with elevated FAB.
 * Slots: Home | Library | [Live FAB] | Edit | Profile
 */
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS, RADII, SPACING, WEIGHTS, SHADOWS, SAFE_BOTTOM } from "../constants/theme";

export type Tab = "home" | "library" | "edit" | "live" | "settings";

interface BottomNavBarProps {
  activeTab: Tab;
  onTabPress: (tab: Tab) => void;
}

const TABS: { tab: Tab; icon: string; label: string }[] = [
  { tab: "home", icon: "⌂", label: "Home" },
  { tab: "library", icon: "▦", label: "Library" },
  { tab: "edit", icon: "✂", label: "Edit" },
  { tab: "settings", icon: "◔", label: "Profile" },
];

export default function BottomNavBar({ activeTab, onTabPress }: BottomNavBarProps) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        {TABS.slice(0, 2).map(({ tab, icon, label }) => (
          <NavItem
            key={tab}
            icon={icon}
            label={label}
            active={activeTab === tab}
            onPress={() => onTabPress(tab)}
          />
        ))}

        <TouchableOpacity
          style={[styles.fab, activeTab === "live" && styles.fabActive]}
          onPress={() => onTabPress("live")}
          activeOpacity={0.85}
        >
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>

        {TABS.slice(2).map(({ tab, icon, label }) => (
          <NavItem
            key={tab}
            icon={icon}
            label={label}
            active={activeTab === tab}
            onPress={() => onTabPress(tab)}
          />
        ))}
      </View>
    </View>
  );
}

function NavItem({
  icon, label, active, onPress,
}: {
  icon: string; label: string; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.tab} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.icon, active && styles.iconActive]}>{icon}</Text>
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", bottom: 0, left: 0, right: 0 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SAFE_BOTTOM,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderLight,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.xs,
  },
  icon: {
    fontSize: 22,
    color: COLORS.textMuted,
    fontWeight: WEIGHTS.medium,
  },
  iconActive: { color: COLORS.text },
  label: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: WEIGHTS.medium,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  labelActive: { color: COLORS.text, fontWeight: WEIGHTS.semibold },
  fab: {
    width: 52,
    height: 36,
    borderRadius: RADII.md,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: SPACING.xs,
    ...SHADOWS.fab,
  },
  fabActive: {
    backgroundColor: COLORS.primaryDark,
  },
  fabIcon: {
    fontSize: 28,
    color: "#FFFFFF",
    fontWeight: WEIGHTS.light,
    lineHeight: 30,
  },
});
