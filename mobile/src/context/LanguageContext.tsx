import { createContext, useContext, useState, ReactNode } from "react";

export type Lang = "en" | "zh";

const translations = {
  en: {
    home: "Home", library: "Library", edit: "Edit", profile: "Profile",
    forYou: "For You", video: "Video", live: "Live", career: "Career", cars: "Cars",
    libraryTitle: "Library", clips: "Clips", photos: "Photos",
    searchClips: "Search clips\u2026",
    noClipsTitle: "No clips yet",
    noClipsSubtitle: "Generate an edit to save your first clip",
    noPhotosTitle: "No photos yet",
    noPhotosSubtitle: "Say \"Gemini, take pictures of me\" on the live tab",
    editTitle: "AI Edit", editPlaceholder: "Describe your edit\u2026", generate: "Generate",
    goLive: "\u25cf Go Live", endStream: "End",
    chooseLanguage: "Language", english: "English", chinese: "\u7b80\u4f53\u4e2d\u6587",
    following: "Following",
    explore: "Explore",
    nearby: "Nearby",
    editScreenTitle: "Edit",
    uploadVideoClips: "Upload Video Clips",
    uploadSubtitle: "MP4, MOV, AVI \u2014 up to 2GB per clip",
    describeYourEdit: "DESCRIBE YOUR EDIT",
    quickPrompts: "QUICK PROMPTS",
    trimRange: "TRIM RANGE (SECONDS)",
    trimStart: "Start",
    trimEnd: "End",
    generating: "Generating\u2026",
    generateEdit: "Generate Edit",
    processingVideo: "Processing video \u2014 this may take a moment\u2026",
    clipSavedToLibrary: "Clip saved to library",
    settingsTitle: "Settings",
    geminiVoice: "Gemini Voice",
    presets: "Presets",
    speech: "Speech",
    rate: "Rate",
    pitch: "Pitch",
    voiceLanguage: "Language",
    voice: "Voice",
    systemDefault: "System default",
    previewVoice: "Preview Voice",
    resetDefaults: "Reset to defaults",
    editPromptPlaceholder: "e.g. Add cinematic transitions, remove dead air, add subtitles…",
    quickAddSubtitles: "Add subtitles",
    quickRemoveSilence: "Remove silence",
    quickTransitions: "Add transitions",
    quickColorGrade: "Color grade",
    quickAddMusic: "Add music",
    quickZoom: "Zoom on action",
    presetDefault: "Default",
    presetChill: "Chill",
    presetHype: "Hype",
    presetDeep: "Deep",
    presetChipmunk: "Chipmunk",
    langEnUS: "English (US)",
    langEnGB: "English (UK)",
    langEnAU: "English (AU)",
    langEs: "Spanish",
    langFr: "French",
    langDe: "German",
    langJa: "Japanese",
  },
  zh: {
    home: "\u9996\u9875", library: "\u5e93", edit: "\u526a\u8f91", profile: "\u6211",
    forYou: "\u63a8\u8350", video: "\u89c6\u9891", live: "\u76f4\u64ad", career: "\u804c\u573a", cars: "\u6c7d\u8f66",
    libraryTitle: "\u6211\u7684\u5e93", clips: "\u526a\u8f91", photos: "\u7167\u7247",
    searchClips: "\u641c\u7d22\u526a\u8f91\u2026",
    noClipsTitle: "\u8fd8\u6ca1\u6709\u526a\u8f91",
    noClipsSubtitle: "\u751f\u6210\u4e00\u4e2a\u7f16\u8f91\u6765\u4fdd\u5b58\u4f60\u7684\u7b2c\u4e00\u4e2a\u526a\u8f91",
    noPhotosTitle: "\u8fd8\u6ca1\u6709\u7167\u7247",
    noPhotosSubtitle: "\u5728\u76f4\u64ad\u9875\u8bf4\u201cGemini\uff0c\u7ed9\u6211\u62cd\u7167\u201d",
    editTitle: "AI \u526a\u8f91", editPlaceholder: "\u63cf\u8ff0\u4f60\u7684\u526a\u8f91\u9700\u6c42\u2026", generate: "\u751f\u6210",
    goLive: "\u25cf \u5f00\u59cb\u76f4\u64ad", endStream: "\u7ed3\u675f",
    chooseLanguage: "\u8bed\u8a00", english: "English", chinese: "\u7b80\u4f53\u4e2d\u6587",
    following: "\u5173\u6ce8",
    explore: "\u63a2\u7d22",
    nearby: "\u9644\u8fd1",
    editScreenTitle: "\u526a\u8f91",
    uploadVideoClips: "\u4e0a\u4f20\u89c6\u9891",
    uploadSubtitle: "MP4, MOV, AVI \u2014 \u6bcf\u4e2a\u6700\u591a 2GB",
    describeYourEdit: "\u63cf\u8ff0\u4f60\u7684\u7f16\u8f91",
    quickPrompts: "\u5feb\u901f\u63d0\u793a",
    trimRange: "\u88c1\u526a\u8303\u56f4\uff08\u79d2\uff09",
    trimStart: "\u5f00\u59cb",
    trimEnd: "\u7ed3\u675f",
    generating: "\u751f\u6210\u4e2d\u2026",
    generateEdit: "\u751f\u6210\u7f16\u8f91",
    processingVideo: "\u89c6\u9891\u5904\u7406\u4e2d\uff0c\u8bf7\u7a0d\u5019\u2026",
    clipSavedToLibrary: "\u526a\u8f91\u5df2\u4fdd\u5b58",
    settingsTitle: "\u8bbe\u7f6e",
    geminiVoice: "Gemini \u8bed\u97f3",
    presets: "\u9884\u8bbe",
    speech: "\u8bed\u97f3\u8bbe\u7f6e",
    rate: "\u8bed\u901f",
    pitch: "\u97f3\u8c03",
    voiceLanguage: "\u8bed\u8a00",
    voice: "\u97f3\u8272",
    systemDefault: "\u7cfb\u7edf\u9ed8\u8ba4",
    previewVoice: "\u9884\u89c8\u8bed\u97f3",
    resetDefaults: "\u6062\u590d\u9ed8\u8ba4",
    editPromptPlaceholder: "例如：添加字幕、去掉沉默片段、添加过渡效果…",
    quickAddSubtitles: "添加字幕",
    quickRemoveSilence: "去掉沉默",
    quickTransitions: "添加过渡",
    quickColorGrade: "调色",
    quickAddMusic: "添加音乐",
    quickZoom: "动作特写",
    presetDefault: "默认",
    presetChill: "轻松",
    presetHype: "激情",
    presetDeep: "低沉",
    presetChipmunk: "花栗鼠",
    langEnUS: "英语（美国）",
    langEnGB: "英语（英国）",
    langEnAU: "英语（澳大利亚）",
    langEs: "西班牙语",
    langFr: "法语",
    langDe: "德语",
    langJa: "日语",
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

interface LanguageContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "en",
  setLang: () => {},
  t: (key) => translations.en[key],
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  const t = (key: TranslationKey): string => translations[lang][key];
  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
