import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from "react-native";
import { useLanguage, Lang } from "../context/LanguageContext";
import { COLORS, RADII, SPACING, WEIGHTS, FONT_SIZES } from "../constants/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function LanguageSheet({ visible, onClose }: Props) {
  const { lang, setLang, t } = useLanguage();

  function choose(l: Lang) {
    setLang(l);
    onClose();
  }

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{t("chooseLanguage")}</Text>

        {(["en", "zh"] as Lang[]).map((l) => {
          const label = l === "en" ? t("english") : t("chinese");
          const active = lang === l;
          return (
            <TouchableOpacity
              key={l}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => choose(l)}
              activeOpacity={0.8}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>
                {label}
              </Text>
              {active && <Text style={styles.check}>✓</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: 40,
    gap: SPACING.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.textMuted,
    alignSelf: "center",
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: WEIGHTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.md,
    backgroundColor: COLORS.surfaceElevated,
  },
  optionActive: {
    backgroundColor: COLORS.primaryBg,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  optionText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    fontWeight: WEIGHTS.medium,
  },
  optionTextActive: {
    color: COLORS.primary,
    fontWeight: WEIGHTS.bold,
  },
  check: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: WEIGHTS.bold,
  },
});
