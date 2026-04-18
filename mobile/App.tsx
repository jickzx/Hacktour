/**
 * Root App component — custom tab navigator with floating bottom nav bar.
 * Sets global default text colour so every screen inherits white-on-dark.
 */
import { useState, useCallback, useEffect } from "react";
import { View, StyleSheet, Text, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import AIEditScreen from "./src/screens/AIEditScreen";
import LiveStreamScreen from "./src/screens/LiveStreamScreen";
import HomeScreen from "./src/screens/HomeScreen";
import LibraryScreen from "./src/screens/LibraryScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import BottomNavBar, { Tab } from "./src/components/BottomNavBar";
import { COLORS } from "./src/constants/theme";
import { loadVoiceSettings } from "./src/services/voiceSettings";

export type AssistantAction = {
  type:
    | "navigate_tab"
    | "go_live"
    | "end_stream"
    | "mute"
    | "unmute"
    | "flip_camera"
    | "create_poll"
    | "close_poll"
    | "emoji_mode"
    | "hype"
    | "shoutout"
    | "countdown"
    | "pull_up_clip"
    | "take_photos"
    | "identify_outfit"
    | "change_voice"
    | "none";
  tab?: Tab;
  poll?: { question: string; options: string[] };
  /** for shoutout: the username to shout out */
  user?: string;
  /** for countdown: seconds (default 5) */
  seconds?: number;
  /** for pull_up_clip: search query extracted from voice command */
  query?: string;
  photos?: { poses: string[] };
  /** for change_voice: preset or explicit rate/pitch */
  voice?: {
    preset?: "default" | "chill" | "hype" | "deep" | "chipmunk";
    rate?: number;
    pitch?: number;
  };
};

/** Force all Text nodes to default to white so dark-mode screens don't need per-component colour props */
(function applyGlobalTextColor() {
  const TextAny = Text as any;
  TextAny.defaultProps = TextAny.defaultProps || {};
  TextAny.defaultProps.style = [
    {
      color: COLORS.text,
      fontFamily: Platform.OS === "ios" ? "System" : undefined,
    },
    TextAny.defaultProps.style,
  ];
})();

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("edit");
  const [pendingAction, setPendingAction] = useState<AssistantAction | null>(null);

  useEffect(() => { loadVoiceSettings(); }, []);

  const handleAssistantAction = useCallback((action: AssistantAction) => {
    if (action.type === "navigate_tab" && action.tab) {
      setActiveTab(action.tab);
    } else {
      setPendingAction(action);
    }
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={[styles.screen, activeTab !== "home" && styles.hidden]}>
        <HomeScreen />
      </View>
      <View style={[styles.screen, activeTab !== "edit" && styles.hidden]}>
        <AIEditScreen />
      </View>
      <View style={[styles.screen, activeTab !== "live" && styles.hidden]}>
        <LiveStreamScreen
          onAssistantAction={handleAssistantAction}
          pendingAction={pendingAction}
          onPendingActionConsumed={() => setPendingAction(null)}
        />
      </View>
      <View style={[styles.screen, activeTab !== "library" && styles.hidden]}>
        <LibraryScreen />
      </View>
      <View style={[styles.screen, activeTab !== "settings" && styles.hidden]}>
        <SettingsScreen />
      </View>

      <BottomNavBar activeTab={activeTab} onTabPress={setActiveTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  screen: {
    ...StyleSheet.absoluteFillObject,
  },
  hidden: {
    display: "none",
  },
});
