/**
 * Gemini voice settings — persisted to disk, subscribed to for live updates
 */
import * as FileSystem from "expo-file-system/legacy";
import * as Speech from "expo-speech";

export interface VoiceSettings {
  rate: number;
  pitch: number;
  language: string;
  voiceId?: string;
}

export type VoicePreset = "default" | "chill" | "hype" | "deep" | "chipmunk";

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  rate: 1.0,
  pitch: 1.0,
  language: "en-US",
  voiceId: undefined,
};

export const VOICE_PRESETS: { label: string; preset: VoicePreset; patch: Partial<VoiceSettings> }[] = [
  { label: "Default", preset: "default", patch: { rate: 1.0, pitch: 1.0 } },
  { label: "Chill", preset: "chill", patch: { rate: 0.92, pitch: 0.95 } },
  { label: "Hype", preset: "hype", patch: { rate: 1.3, pitch: 1.2 } },
  { label: "Deep", preset: "deep", patch: { rate: 1.0, pitch: 0.7 } },
  { label: "Chipmunk", preset: "chipmunk", patch: { rate: 1.4, pitch: 1.8 } },
];

const HUMAN_VOICE_HINTS = ["natural", "premium", "enhanced", "samantha", "ava", "allison", "serena", "daniel", "google", "english"];

const FILE = `${FileSystem.documentDirectory}voice-settings.json`;

let current: VoiceSettings = { ...DEFAULT_VOICE_SETTINGS };
let loaded = false;
const listeners = new Set<(s: VoiceSettings) => void>();

/**
 * Score the most natural sounding local voice for Panda.
 */
function scoreVoice(voice: Speech.Voice, language: string): number {
  const exactLanguage = voice.language?.toLowerCase() === language.toLowerCase() ? 8 : 0;
  const quality = String(voice.quality ?? "").toLowerCase();
  const qualityScore = quality.includes("enhanced") ? 6 : quality.includes("default") ? 3 : 0;
  const name = `${voice.name} ${voice.identifier}`.toLowerCase();
  const nameScore = HUMAN_VOICE_HINTS.reduce((score, hint) => score + (name.includes(hint) ? 2 : 0), 0);
  return exactLanguage + qualityScore + nameScore;
}

/**
 * Prefer a voice that sounds less robotic when the device offers one.
 */
function pickHumanLikeVoice(voices: Speech.Voice[], language: string): Speech.Voice | undefined {
  const prefix = language.slice(0, 2).toLowerCase();
  return [...voices]
    .filter((voice) => voice.language?.toLowerCase().startsWith(prefix))
    .sort((a, b) => scoreVoice(b, language) - scoreVoice(a, language))[0];
}

/**
 * Upgrade Panda to the best local voice available for the current language.
 */
export async function ensureHumanLikeVoice(language = current.language): Promise<VoiceSettings> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const preferred = pickHumanLikeVoice(voices, language);
    if (preferred && current.voiceId !== preferred.identifier) {
      current = { ...current, language, voiceId: preferred.identifier };
      await FileSystem.writeAsStringAsync(FILE, JSON.stringify(current));
    }
  } catch {}
  return current;
}

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
  await ensureHumanLikeVoice(current.language);
  return current;
}

export function getVoiceSettings(): VoiceSettings {
  return current;
}

/**
 * Map a named preset to the voice settings patch it applies.
 */
export function getVoicePresetPatch(preset: VoicePreset): Partial<VoiceSettings> {
  return VOICE_PRESETS.find((item) => item.preset === preset)?.patch ?? {};
}

export async function updateVoiceSettings(patch: Partial<VoiceSettings>): Promise<VoiceSettings> {
  current = { ...current, ...patch };
  if (!patch.voiceId || patch.language) {
    await ensureHumanLikeVoice(current.language);
  }
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
