/**
 * BottomNavBar — XHS-style 5-slot tab bar with elevated FAB.
 * Profile slot shows a drop-up menu with Profile + Inventory options.
 */
import { useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { COLORS, RADII, SPACING, WEIGHTS, SHADOWS, SAFE_BOTTOM } from "../constants/theme";
import { useLanguage, TranslationKey } from "../context/LanguageContext";

export type Tab = "home" | "library" | "edit" | "live" | "settings" | "inventory";

interface BottomNavBarProps {
  activeTab: Tab;
  onTabPress: (tab: Tab) => void;
}

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const LEFT_TABS: { tab: Tab; icon: IoniconName; iconActive: IoniconName; labelKey: TranslationKey }[] = [
  { tab: "home",    icon: "home-outline",   iconActive: "home",   labelKey: "home" },
  { tab: "library", icon: "albums-outline", iconActive: "albums", labelKey: "library" },
];

const RIGHT_TABS: { tab: Tab; icon: IoniconName; iconActive: IoniconName; labelKey: TranslationKey }[] = [
  { tab: "edit", icon: "cut-outline", iconActive: "cut", labelKey: "edit" },
];

const PROFILE_IS_ACTIVE_TABS: Tab[] = ["settings", "inventory"];

export default function BottomNavBar({ activeTab, onTabPress }: BottomNavBarProps) {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;

  const openMenu = () => {
    setMenuOpen(true);
    Animated.spring(menuAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
  };

  const closeMenu = () => {
    Animated.timing(menuAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() =>
      setMenuOpen(false)
    );
  };

  const pickTab = (tab: Tab) => {
    closeMenu();
    onTabPress(tab);
  };

  const profileActive = PROFILE_IS_ACTIVE_TABS.includes(activeTab);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {/* Drop-up backdrop */}
      {menuOpen && (
        <TouchableWithoutFeedback onPress={closeMenu}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
      )}

      {/* Drop-up menu */}
      {menuOpen && (
        <Animated.View
          style={[
            styles.dropUp,
            {
              opacity: menuAnim,
              transform: [
                {
                  translateY: menuAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            },
          ]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={styles.dropItem}
            onPress={() => pickTab("settings")}
            activeOpacity={0.8}
          >
            <View style={[styles.dropIcon, activeTab === "settings" && styles.dropIconActive]}>
              <Ionicons
                name={activeTab === "settings" ? "person" : "person-outline"}
                size={20}
                color={activeTab === "settings" ? COLORS.primary : COLORS.text}
              />
            </View>
            <Text style={[styles.dropLabel, activeTab === "settings" && styles.dropLabelActive]}>
              Profile
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dropItem}
            onPress={() => pickTab("inventory")}
            activeOpacity={0.8}
          >
            <View style={[styles.dropIcon, activeTab === "inventory" && styles.dropIconActive]}>
              <Ionicons
                name={activeTab === "inventory" ? "cube" : "cube-outline"}
                size={20}
                color={activeTab === "inventory" ? COLORS.primary : COLORS.text}
              />
            </View>
            <Text style={[styles.dropLabel, activeTab === "inventory" && styles.dropLabelActive]}>
              Inventory
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      <View style={styles.bar}>
        {LEFT_TABS.map(({ tab, icon, iconActive, labelKey }) => (
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

        {RIGHT_TABS.map(({ tab, icon, iconActive, labelKey }) => (
          <NavItem
            key={tab}
            icon={activeTab === tab ? iconActive : icon}
            label={t(labelKey)}
            active={activeTab === tab}
            onPress={() => onTabPress(tab)}
          />
        ))}

        {/* Profile slot — tap opens drop-up */}
        <TouchableOpacity
          style={styles.tab}
          onPress={menuOpen ? closeMenu : openMenu}
          activeOpacity={0.7}
        >
          <Ionicons
            name={profileActive ? "person" : "person-outline"}
            size={22}
            color={profileActive || menuOpen ? COLORS.text : COLORS.textMuted}
          />
          <Text style={[styles.label, (profileActive || menuOpen) && styles.labelActive]}>
            {activeTab === "inventory" ? "Inventory" : "Profile"}
          </Text>
        </TouchableOpacity>
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
  fabActive: { backgroundColor: COLORS.primaryDark },

  // Drop-up menu
  dropUp: {
    position: "absolute",
    bottom: SAFE_BOTTOM + 56,
    right: SPACING.md,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: "hidden",
    ...SHADOWS.float,
    minWidth: 160,
  },
  dropItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  dropIcon: {
    width: 36,
    height: 36,
    borderRadius: RADII.md,
    backgroundColor: COLORS.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  dropIconActive: { backgroundColor: COLORS.primaryBg },
  dropLabel: { color: COLORS.text, fontSize: 14, fontWeight: WEIGHTS.semibold },
  dropLabelActive: { color: COLORS.primary },
});
