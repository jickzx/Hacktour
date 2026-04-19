/**
 * Root App component — custom tab navigator with floating bottom nav bar.
 * Sets global default text colour so every screen inherits white-on-dark.
 */
import { useState, useCallback, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import AIEditScreen from "./src/screens/AIEditScreen";
import LiveStreamScreen from "./src/screens/LiveStreamScreen";
import HomeScreen from "./src/screens/HomeScreen";
import LibraryScreen from "./src/screens/LibraryScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import InventoryScreen from "./src/screens/InventoryScreen";
import BottomNavBar, { Tab } from "./src/components/BottomNavBar";
import { COLORS } from "./src/constants/theme";
import { LanguageProvider } from "./src/context/LanguageContext";
import { loadVoiceSettings } from "./src/services/voiceSettings";

export type AssistantAction = {
  type: "navigate_tab" | "go_live" | "end_stream" | "mute" | "unmute" | "flip_camera" | "create_poll" | "close_poll" | "emoji_mode" | "hype" | "shoutout" | "countdown" | "pull_up_clip" | "pull_up_product" | "clip" | "take_photos" | "identify_outfit" | "identify_product" | "change_voice" | "none";
  tab?: Tab;
  poll?: { question: string; options: string[] };
  user?: string;
  seconds?: number;
  query?: string;
  poses?: string[];
  count?: number;
  auto?: boolean;
  preset?: "default" | "chill" | "hype" | "deep" | "chipmunk";
  language?: string;
};

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
    <LanguageProvider>
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
        <LibraryScreen isFocused={activeTab === "library"} />
      </View>
      <View style={[styles.screen, activeTab !== "settings" && styles.hidden]}>
        <SettingsScreen />
      </View>
      <View style={[styles.screen, activeTab !== "inventory" && styles.hidden]}>
        <InventoryScreen isFocused={activeTab === "inventory"} />
      </View>

      <BottomNavBar activeTab={activeTab} onTabPress={setActiveTab} />
    </View>
    </LanguageProvider>
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
