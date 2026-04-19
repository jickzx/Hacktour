/**
 * BottomNavBar — XHS-style 5-slot tab bar with elevated FAB.
 * Slots: Home | Library | [Live FAB] | Edit | Profile
 */
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS, RADII, SPACING, WEIGHTS, SHADOWS, SAFE_BOTTOM } from "../constants/theme";
import { useLanguage, TranslationKey } from "../context/LanguageContext";

export type Tab = "home" | "library" | "edit" | "live" | "settings";

interface BottomNavBarProps {
  activeTab: Tab;
  onTabPress: (tab: Tab) => void;
}

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: { tab: Tab; icon: IoniconName; iconActive: IoniconName; labelKey: TranslationKey }[] = [
  { tab: "home",     icon: "home-outline",    iconActive: "home",    labelKey: "home" },
  { tab: "library",  icon: "albums-outline",  iconActive: "albums",  labelKey: "library" },
  { tab: "edit",     icon: "cut-outline",     iconActive: "cut",     labelKey: "edit" },
  { tab: "settings", icon: "person-outline",  iconActive: "person",  labelKey: "profile" },
];

export default function BottomNavBar({ activeTab, onTabPress }: BottomNavBarProps) {
  const { t } = useLanguage();
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        {TABS.slice(0, 2).map(({ tab, icon, iconActive, labelKey }) => (
          <NavItem
            key={tab}
            icon={activeTab === tab ? iconActive : icon}
            label={t(labelKey)}
            active={activeTab === tab}
            onPress={() => onTabPress(tab)}
          />
        ))}

        <TouchableOpacity
          style={[styles.fab, activeTab === "live" && styles.fabActive]}
          onPress={() => onTabPress("live")}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={30} color="#FFFFFF" />
        </TouchableOpacity>

        {TABS.slice(2).map(({ tab, icon, iconActive, labelKey }) => (
          <NavItem
            key={tab}
            icon={activeTab === tab ? iconActive : icon}
            label={t(labelKey)}
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
  icon: IoniconName; label: string; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.tab} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={22} color={active ? COLORS.text : COLORS.textMuted} />
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
