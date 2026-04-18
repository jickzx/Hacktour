/**
 * Gemini voice settings — persisted to disk, subscribed to for live updates
 */
import * as FileSystem from "expo-file-system/legacy";

export interface VoiceSettings {
  rate: number;
  pitch: number;
  language: string;
  voiceId?: string;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  rate: 1.1,
  pitch: 1.0,
  language: "en-US",
  voiceId: undefined,
};

export type VoicePreset = "default" | "chill" | "hype" | "deep" | "chipmunk";

export const VOICE_PRESETS: Record<VoicePreset, Partial<VoiceSettings>> = {
  default:  { rate: 1.1, pitch: 1.0 },
  chill:    { rate: 0.9, pitch: 0.9 },
  hype:     { rate: 1.3, pitch: 1.2 },
  deep:     { rate: 1.0, pitch: 0.7 },
  chipmunk: { rate: 1.4, pitch: 1.8 },
};

const FILE = `${FileSystem.documentDirectory}voice-settings.json`;

let current: VoiceSettings = { ...DEFAULT_VOICE_SETTINGS };
let loaded = false;
const listeners = new Set<(s: VoiceSettings) => void>();

export async function loadVoiceSettings(): Promise<VoiceSettings> {
  if (loaded) return current;
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (info.exists) {
      const raw = await FileSystem.readAsStringAsync(FILE);
      const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
      current = { ...DEFAULT_VOICE_SETTINGS, ...parsed };
    }
  } catch {}
  loaded = true;
  return current;
}

export function getVoiceSettings(): VoiceSettings {
  return current;
}

export async function updateVoiceSettings(patch: Partial<VoiceSettings>): Promise<VoiceSettings> {
  current = { ...current, ...patch };
  try {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(current));
  } catch {}
  listeners.forEach((l) => l(current));
  return current;
}

export function subscribeVoiceSettings(listener: (s: VoiceSettings) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
