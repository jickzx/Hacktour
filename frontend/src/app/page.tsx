"use client";

import { motion, AnimatePresence, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";

type Lang = "en" | "zh";

const COPY = {
  en: {
    nav: { feed: "Feed", features: "Features", voice: "Voice", stack: "Stack", cta: "Open the app" },
    hero: {
      chip: "Powered by Z.ai · London Hacktour 2026",
      h1a: "Stream like it's",
      h1b: "Xiaohongshu",
      h1c: ", only smarter.",
      sub: "A live-streaming app inspired by Xiaohongshu, with an AI panda that actually runs your stream. Polls, clips, photos, shopping — just say the word.",
      ctaPrimary: "Start streaming free",
      ctaSecondary: "See the feed",
      social: (n: string) => (<>Loved by <b style={{ color: "var(--ink)" }}>{n}+</b> creators in beta</>),
      socialCount: "2,400",
    },
    feed: {
      chip: "Home feed",
      h2a: "A feed that feels like",
      h2b: "Xiaohongshu",
      h2c: ".",
      sub: "Masonry-style cards mixing live streams, clips, photos and polls. Every post is made by — or starring — an AI panda.",
      tabs: { menu: "≡", following: "Following", explore: "Explore", nearby: "Nearby" },
      subTabs: ["For You", "Video", "Live", "Career", "Cars"],
    },
    feedPosts: [
      { badge: "📷 Photo", title: "Morning ritual in Shoreditch ☕" },
      { badge: "🎬 Clip", title: "Panda auto-clipped my best cooking moment" },
      { badge: "📊 Poll", title: "Which outfit? I can't decide 👗" },
      { badge: "🛍 Shop", title: "Every piece I'm wearing — tap to buy" },
      { badge: "🎤 Live", title: "Live from the rooftop — ask me anything" },
      { badge: "✂️ Edit", title: "Turned a 2hr stream into a 40s reel" },
    ],
    features: {
      chip: "Features",
      h2a: "Six superpowers.",
      h2b: "One panda.",
      items: [
        { title: "Panda AI Co-Pilot", desc: "Voice-controlled host that runs your stream. Just talk — Panda handles polls, clips, scenes.", tag: "Live" },
        { title: "Instant AI Edits", desc: "Describe your edit in plain English. Transitions, subtitles, color grading — done in seconds.", tag: "Edit" },
        { title: "Auto Clip Highlights", desc: "Panda spots viral moments mid-stream and saves them with AI titles, one voice command away.", tag: "Clips" },
        { title: "AI Photo Sessions", desc: "Guided shoots during streams. Pose suggestions, frame capture, cinematic post-processing.", tag: "Photos" },
        { title: "Outfit Identifier", desc: "Point, snap, shop. Gemini names every piece and links straight to where viewers can buy.", tag: "Shop" },
        { title: "Live Transcription", desc: "Every word transcribed in real-time to drive reactions, polls, and smart chat engagement.", tag: "Voice" },
      ],
    },
    voice: {
      chip: "Voice commands",
      h2a: "Just say",
      h2b: "\u201CPanda\u201D",
      h2c: ".",
      sub: "No menus, no buttons — natural language runs the show.",
      commands: [
        "\"Panda, go live\"",
        "\"Create a poll — cats or dogs?\"",
        "\"Clip this moment\"",
        "\"Take my photo\"",
        "\"What am I wearing?\"",
        "\"Pull up my cooking clip\"",
        "\"Summarize the chat\"",
        "\"Play hype music\"",
      ],
    },
    tech: {
      chip: "Under the hood",
      h2: "Built on open tools.",
    },
    cta: {
      h2: "Ready when you are.",
      sub1: "Open the app, say ",
      subBold: "\u201CPanda, go live\u201D",
      sub2: ", and let the stream run itself. Free during beta — no card, no limits.",
      button: "Launch PandaNote",
      note: "Free during beta · London Hacktour 2026",
    },
    footer: {
      by: "by Hacktour",
      note: "Built in London · Hacktour 2026 · Inspired by Xiaohongshu · PandaNote 熊猫书",
    },
  },
  zh: {
    nav: { feed: "发现", features: "功能", voice: "语音", stack: "技术栈", cta: "打开应用" },
    hero: {
      chip: "基于 Z.ai · 伦敦 Hacktour 2026",
      h1a: "直播,就像",
      h1b: "小红书",
      h1c: ",只是更聪明。",
      sub: "一款灵感来自小红书的直播应用,配备真正能帮你运营直播的 AI 熊猫。投票、剪辑、照片、购物 —— 动动嘴就好。",
      ctaPrimary: "免费开始直播",
      ctaSecondary: "看看首页",
      social: (n: string) => (<>已被 <b style={{ color: "var(--ink)" }}>{n}+</b> 位内测创作者喜欢</>),
      socialCount: "2,400",
    },
    feed: {
      chip: "首页信息流",
      h2a: "一个像",
      h2b: "小红书",
      h2c: "一样的首页。",
      sub: "瀑布流卡片,直播、剪辑、照片、投票混合呈现。每一条帖子都由 AI 熊猫出品或出演。",
      tabs: { menu: "≡", following: "关注", explore: "发现", nearby: "附近" },
      subTabs: ["推荐", "视频", "直播", "职场", "汽车"],
    },
    feedPosts: [
      { badge: "📷 照片", title: "肖尔迪奇的早晨仪式 ☕" },
      { badge: "🎬 剪辑", title: "熊猫自动剪出我最佳做饭瞬间" },
      { badge: "📊 投票", title: "选哪套?真的决定不了 👗" },
      { badge: "🛍 购物", title: "今天的每一件 —— 点一下直接买" },
      { badge: "🎤 直播", title: "屋顶直播中 —— 有问必答" },
      { badge: "✂️ 剪辑", title: "两小时直播剪成 40 秒神作" },
    ],
    features: {
      chip: "功能",
      h2a: "六种超能力。",
      h2b: "一只熊猫。",
      items: [
        { title: "熊猫 AI 副驾", desc: "语音主持,帮你运营整场直播。说出来就行 —— 投票、剪辑、切换场景,熊猫来。", tag: "直播" },
        { title: "秒级 AI 剪辑", desc: "用一句话描述想法,转场、字幕、调色,几秒钟搞定。", tag: "剪辑" },
        { title: "自动高光剪辑", desc: "熊猫实时捕捉爆款瞬间,配上 AI 标题自动保存,一句话即可分享。", tag: "剪辑" },
        { title: "AI 拍照环节", desc: "直播中引导拍摄,摆姿建议、抓拍,再加电影级后期。", tag: "拍照" },
        { title: "穿搭识别", desc: "对准镜头,Gemini 识别每件单品,一键跳转购买链接。", tag: "购物" },
        { title: "实时字幕", desc: "每一句话都实时转写,驱动 AI 反应、投票和智能聊天互动。", tag: "语音" },
      ],
    },
    voice: {
      chip: "语音指令",
      h2a: "一句",
      h2b: "\u201C熊猫\u201D",
      h2c: "即可。",
      sub: "没有菜单,没有按钮 —— 用日常语言运营直播。",
      commands: [
        "\u201C熊猫,开播\u201D",
        "\u201C发个投票 —— 猫还是狗?\u201D",
        "\u201C把这段剪下来\u201D",
        "\u201C帮我拍张照\u201D",
        "\u201C我身上穿的是什么?\u201D",
        "\u201C调出我的做饭剪辑\u201D",
        "\u201C帮我总结一下聊天\u201D",
        "\u201C放点气氛音乐\u201D",
      ],
    },
    tech: {
      chip: "幕后技术",
      h2: "基于开源技术栈。",
    },
    cta: {
      h2: "准备好就开始。",
      sub1: "打开应用,说一句 ",
      subBold: "\u201C熊猫,开播\u201D",
      sub2: ",直播自己就会跑起来。内测期间免费 —— 无需绑卡,没有限制。",
      button: "启动熊猫书",
      note: "内测免费 · 伦敦 Hacktour 2026",
    },
    footer: {
      by: "出品方 Hacktour",
      note: "伦敦出品 · Hacktour 2026 · 灵感来自小红书 · 熊猫书 PandaNote",
    },
  },
} as const;

const FEATURE_META = [
  { emoji: "🐼", tint: "rgba(255, 184, 154, 0.15)" },
  { emoji: "✂️", tint: "rgba(255, 217, 107, 0.15)" },
  { emoji: "🎬", tint: "rgba(127, 216, 183, 0.15)" },
  { emoji: "📸", tint: "rgba(200, 169, 240, 0.15)" },
  { emoji: "👗", tint: "rgba(143, 196, 238, 0.15)" },
  { emoji: "🗣", tint: "rgba(255, 184, 154, 0.15)" },
];

const FEED_META = [
  { h: 340, gradient: "linear-gradient(135deg, #FF6B81 0%, #8B2E3F 100%)", author: "mia.streams", likes: "12.4k" },
  { h: 440, gradient: "linear-gradient(160deg, #4E9A7D 0%, #1F3A33 100%)", author: "foodwithren", likes: "8.2k", play: true },
  { h: 280, gradient: "linear-gradient(200deg, #8061B3 0%, #3C2A5C 100%)", author: "nova.ootd", likes: "3.1k" },
  { h: 380, gradient: "linear-gradient(135deg, #D4862A 0%, #6B3E0F 100%)", author: "luca.fit", likes: "21.7k" },
  { h: 300, gradient: "linear-gradient(220deg, #3F7AAD 0%, #14334D 100%)", author: "jin.world", likes: "5.9k", live: true },
  { h: 400, gradient: "linear-gradient(160deg, #D4455E 0%, #5C1C2B 100%)", author: "ty.edits", likes: "16.8k" },
];

function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "en" ? "zh" : "en")}
      className="relative inline-flex items-center rounded-full p-0.5 transition-colors"
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid var(--line)",
      }}
      aria-label="Toggle language"
    >
      <span
        className="relative z-10 px-2.5 py-1 text-[11px] font-bold transition-colors"
        style={{ color: lang === "en" ? "#fff" : "var(--muted)" }}
      >
        EN
      </span>
      <span
        className="relative z-10 px-2.5 py-1 text-[11px] font-bold transition-colors"
        style={{ color: lang === "zh" ? "#fff" : "var(--muted)" }}
      >
        中
      </span>
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="absolute top-0.5 bottom-0.5 rounded-full"
        style={{
          background: "var(--coral)",
          left: lang === "en" ? 2 : "calc(50% - 1px)",
          right: lang === "en" ? "calc(50% - 1px)" : 2,
        }}
      />
    </button>
  );
}

function Navbar({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const c = COPY[lang];
  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: "linear-gradient(180deg, rgba(20, 6, 10, 0.88) 0%, rgba(10, 10, 11, 0.82) 100%)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255, 36, 66, 0.2)",
        boxShadow: "0 1px 0 0 rgba(255, 36, 66, 0.08), 0 4px 24px -4px rgba(0,0,0,0.5)",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: "var(--coral)" }}>
            🐼
          </div>
          <span className="font-bold text-[17px] tracking-tight" style={{ color: "var(--ink)" }}>
            {lang === "zh" ? "熊猫书" : "PandaNote"}
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <a href="#feed" className="text-sm font-semibold transition-colors hover:text-white" style={{ color: "var(--muted)" }}>{c.nav.feed}</a>
          <a href="#features" className="text-sm font-semibold transition-colors hover:text-white" style={{ color: "var(--muted)" }}>{c.nav.features}</a>
          <a href="#voice" className="text-sm font-semibold transition-colors hover:text-white" style={{ color: "var(--muted)" }}>{c.nav.voice}</a>
          <a href="#tech" className="text-sm font-semibold transition-colors hover:text-white" style={{ color: "var(--muted)" }}>{c.nav.stack}</a>
        </div>
        <div className="flex items-center gap-3">
          <LangToggle lang={lang} setLang={setLang} />
          <a href="#cta" className="pill-red">{c.nav.cta}</a>
        </div>
      </div>
    </motion.nav>
  );
}

type ChatMsg = { user: string; text: string; color: string; self?: boolean };

const CHAT_POOL: ChatMsg[] = [
  { user: "pixel_god7", text: "CHAT IS THIS TUFF", color: "#FF6B81" },
  { user: "🎙 you (live)", text: "let kanye cook bro", color: "var(--butter)", self: true },
  { user: "yyds_fan", text: "666 太牛逼了", color: "#FF6B81" },
  { user: "skrtcobain", text: "ye my goat 🐐", color: "#FF6B81" },
  { user: "intern_hopeful", text: "kanye give me an internship please", color: "#FF6B81" },
];

function ChatRotator() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2200);
    return () => clearInterval(id);
  }, []);

  const SLOTS = 3;
  const ROW = 34;
  const visible = Array.from({ length: SLOTS }, (_, i) => {
    const idx = (tick + i) % CHAT_POOL.length;
    return { ...CHAT_POOL[idx], key: `${tick + i}`, slot: SLOTS - 1 - i };
  });

  return (
    <div className="relative h-[108px] overflow-hidden">
      <AnimatePresence initial={false}>
        {visible.map((m) => (
          <motion.div
            key={m.key}
            initial={{ opacity: 0, y: SLOTS * ROW }}
            animate={{ opacity: m.slot === 0 ? 0.45 : 1, y: m.slot * ROW }}
            exit={{ opacity: 0, y: -ROW }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 max-w-[92%] px-2.5 py-1.5 rounded-xl text-[10px]"
            style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
          >
            <span className="font-bold" style={{ color: m.color }}>{m.user}</span>{" "}
            {m.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function PhoneMock() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, rotate: 6 }}
      animate={{ opacity: 1, y: 0, rotate: 4 }}
      transition={{ delay: 0.5, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-[280px] sm:w-[320px] aspect-[9/19.5] rounded-[44px] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)]"
      style={{
        background: "#0A0A0B",
        padding: "10px",
        border: "8px solid #000",
      }}
    >
      <div className="w-full h-full rounded-[34px] overflow-hidden relative" style={{ background: "#000" }}>
        <video
          src="/pandanote.mov"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.35) 100%)" }} />
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-6 rounded-full bg-black z-20" />

        <div className="absolute top-3 left-0 right-0 px-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.2)" }}>🐼</div>
            <div className="live-pill">
              <span className="live-dot" /> LIVE
            </div>
          </div>
          <div className="text-white text-[11px] font-bold font-mono">01:40</div>
          <div className="flex items-center gap-1.5">
            <div className="chip text-[10px] px-2 py-1" style={{ background: "rgba(0,0,0,0.55)", borderColor: "rgba(255,255,255,0.15)", color: "#fff" }}>
              👁 172
            </div>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white" style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.2)" }}>✕</div>
          </div>
        </div>

        <div className="absolute top-[52px] right-3 w-[62%] rounded-2xl overflow-hidden" style={{ background: "rgba(10,10,11,0.92)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="px-3 pt-2.5 pb-2 flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-white text-[11px] font-bold truncate">Nike Air Max 90</div>
              <div className="text-[9px] font-semibold" style={{ color: "var(--muted)" }}>Nike · $135</div>
            </div>
            <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] text-white" style={{ background: "rgba(255,255,255,0.15)" }}>✕</div>
          </div>
          <div className="h-24 w-full flex items-center justify-center overflow-hidden" style={{ background: "#fff" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/airmax90-black.jpg" alt="Nike Air Max 90 Triple Black" className="w-full h-full object-contain" />
          </div>
          <div className="p-1.5 flex flex-col gap-1">
            <div className="py-1.5 rounded-lg text-center text-[10px] font-bold text-white" style={{ background: "rgba(255,255,255,0.1)" }}>Add to Bag</div>
            <div className="py-1.5 rounded-lg text-center text-[10px] font-bold text-white" style={{ background: "var(--coral)" }}>Open</div>
          </div>
        </div>

        <div className="absolute left-2 top-24 flex flex-col gap-2">
          {[
            { emoji: "🎙", color: "rgba(0,0,0,0.55)" },
            { emoji: "✨", color: "rgba(0,0,0,0.55)" },
            { emoji: "🐼", color: "rgba(255, 36, 66, 0.22)" },
            { emoji: "❓", color: "rgba(0,0,0,0.55)" },
            { emoji: "✂️", color: "rgba(0,0,0,0.55)" },
          ].map((b, i) => (
            <div key={i} className="w-9 h-9 rounded-full flex items-center justify-center text-sm" style={{ background: b.color, border: "1px solid rgba(255,255,255,0.15)" }}>
              {b.emoji}
            </div>
          ))}
        </div>

        <div className="absolute bottom-20 left-14 right-3">
          <ChatRotator />
        </div>

        <div className="absolute bottom-4 left-3 right-3 flex items-center gap-2">
          <div className="flex-1 px-3 py-2 rounded-full text-[10px]" style={{ background: "rgba(0,0,0,0.55)", color: "var(--muted)", border: "1px solid rgba(255,255,255,0.1)" }}>
            Comment…
          </div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs" style={{ background: "rgba(255,255,255,0.15)" }}>↑</div>
        </div>
      </div>
    </motion.div>
  );
}

function Hero({ lang }: { lang: Lang }) {
  const c = COPY[lang].hero;
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);

  return (
    <section ref={ref} className="relative min-h-screen hero-bg overflow-hidden pt-28 pb-16">
      <div className="relative max-w-7xl mx-auto px-6 grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-6 items-center">
        <motion.div style={{ y }} className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.7 }}
            className="chip mb-6"
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--coral)" }} />
            {c.chip}
          </motion.div>

          <motion.h1
            key={`h1-${lang}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-[46px] sm:text-6xl lg:text-[76px] font-black tracking-[-0.03em] leading-[1.02]"
            style={{ color: "var(--ink)" }}
          >
            {c.h1a}
            <br />
            <span className="handdrawn-underline">
              <span className="shimmer-text">{c.h1b}</span>
            </span>
            {c.h1c}
          </motion.h1>

          <motion.p
            key={`sub-${lang}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mt-6 text-[17px] leading-relaxed max-w-xl"
            style={{ color: "var(--muted)" }}
          >
            {c.sub}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3"
          >
            <a href="#cta" className="pill-red inline-flex items-center">
              {c.ctaPrimary}
              <span className="ml-2">→</span>
            </a>
            <a href="#feed" className="pill-ghost">{c.ctaSecondary}</a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.8 }}
            className="mt-10 flex items-center gap-3 text-xs font-semibold"
            style={{ color: "var(--muted)" }}
          >
            <div className="flex -space-x-2">
              {["#FFB89A", "#7FD8B7", "#C8A9F0", "#FFD96B"].map((col, i) => (
                <div key={i} className="w-8 h-8 rounded-full" style={{ background: col, border: "2px solid var(--bg)" }} />
              ))}
            </div>
            <span>{c.social(c.socialCount)}</span>
          </motion.div>
        </motion.div>

        <div className="relative flex justify-center lg:justify-end">
          <PhoneMock />
        </div>
      </div>
    </section>
  );
}

function FeedPreview({ lang }: { lang: Lang }) {
  const c = COPY[lang].feed;
  const posts = COPY[lang].feedPosts;
  return (
    <section id="feed" className="relative py-24 px-6" style={{ background: "var(--bg)" }}>
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex items-end justify-between mb-8 flex-wrap gap-6"
        >
          <div>
            <div className="chip mb-3">
              <span style={{ color: "var(--coral)" }}>●</span> {c.chip}
            </div>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight" style={{ color: "var(--ink)" }}>
              {c.h2a} <span style={{ color: "var(--coral)" }}>{c.h2b}</span>{c.h2c}
            </h2>
          </div>
          <p className="max-w-sm text-[15px]" style={{ color: "var(--muted)" }}>
            {c.sub}
          </p>
        </motion.div>

        <div className="mb-6 flex items-center gap-4 border-b" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center gap-6 pb-3">
            <span className="text-sm font-bold" style={{ color: "var(--muted)" }}>{c.tabs.menu}</span>
            <span className="text-base font-bold relative" style={{ color: "var(--ink)" }}>
              {c.tabs.following}
              <span className="absolute -bottom-[13px] left-1/2 -translate-x-1/2 w-6 h-[3px] rounded-full" style={{ background: "var(--coral)" }} />
            </span>
            <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>{c.tabs.explore}</span>
            <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>{c.tabs.nearby}</span>
          </div>
          <span className="ml-auto text-sm" style={{ color: "var(--muted)" }}>🔍</span>
        </div>

        <div className="mb-6 flex items-center gap-5 overflow-x-auto pb-1">
          {c.subTabs.map((t, i) => (
            <span
              key={t}
              className={`text-sm whitespace-nowrap ${i === 0 ? "font-bold" : "font-medium"}`}
              style={{ color: i === 0 ? "var(--ink)" : "var(--muted)" }}
            >
              {t}
            </span>
          ))}
          <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>▽</span>
        </div>

        <div className="columns-2 md:columns-3 gap-3 [column-fill:_balance]">
          {posts.map((p, i) => {
            const meta = FEED_META[i];
            return (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (i % 3) * 0.08, duration: 0.5 }}
                className="mb-3 break-inside-avoid xhs-card"
              >
                <div
                  className="relative w-full"
                  style={{ height: meta.h, background: meta.gradient }}
                >
                  {meta.play && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-base shadow-xl" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", color: "#fff" }}>▶</div>
                    </div>
                  )}
                  {meta.live && (
                    <div className="absolute top-3 right-3 live-pill">
                      <span className="live-dot" /> LIVE
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.4)", color: "#fff" }}>
                    {p.badge}
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-[13px] font-semibold leading-snug mb-2" style={{ color: "var(--ink)" }}>
                    {p.title}
                  </p>
                  <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--muted)" }}>
                    <span className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full" style={{ background: "var(--peach)" }} />
                      {meta.author}
                    </span>
                    <span className="font-semibold flex items-center gap-1">♡ {meta.likes}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Features({ lang }: { lang: Lang }) {
  const c = COPY[lang].features;
  return (
    <section id="features" className="relative py-28 px-6" style={{ background: "var(--bg-soft)" }}>
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <div className="chip mb-4"><span style={{ color: "var(--coral)" }}>✦</span> {c.chip}</div>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight" style={{ color: "var(--ink)" }}>
            {c.h2a}
            <br />
            <span style={{ color: "var(--muted)" }}>{c.h2b}</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {c.items.map((f, i) => {
            const meta = FEATURE_META[i];
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.5 }}
                className="soft-card p-6 group hover:border-[rgba(255,36,66,0.25)] transition-colors"
              >
                <div className="flex items-start justify-between mb-5">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                    style={{ background: meta.tint }}
                  >
                    {meta.emoji}
                  </div>
                  <span
                    className="text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(255, 36, 66, 0.12)", color: "var(--coral-light)" }}
                  >
                    {f.tag}
                  </span>
                </div>
                <h3 className="text-[18px] font-bold mb-2 tracking-tight" style={{ color: "var(--ink)" }}>
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                  {f.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function VoiceMarquee({ lang }: { lang: Lang }) {
  const c = COPY[lang].voice;
  const items = [...c.commands, ...c.commands];
  return (
    <section id="voice" className="relative py-24 overflow-hidden" style={{ background: "var(--bg)" }}>
      <div className="max-w-5xl mx-auto px-6 text-center mb-10">
        <div className="chip mb-4"><span style={{ color: "var(--coral)" }}>🎙</span> {c.chip}</div>
        <h2 className="text-4xl sm:text-5xl font-black tracking-tight" style={{ color: "var(--ink)" }}>
          {c.h2a} <span className="shimmer-text">{c.h2b}</span>{c.h2c}
        </h2>
        <p className="mt-4 max-w-md mx-auto text-[15px]" style={{ color: "var(--muted)" }}>
          {c.sub}
        </p>
      </div>

      <div className="relative">
        <div className="flex w-max marquee-track">
          {items.map((cmd, i) => (
            <div
              key={i}
              className="shrink-0 mx-2 soft-card px-6 py-4 flex items-center gap-3"
              style={{ minWidth: 320 }}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ background: "rgba(255,36,66,0.14)" }}>🐼</div>
              <code className="font-mono text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                {cmd}
              </code>
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24" style={{ background: "linear-gradient(to right, var(--bg), transparent)" }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24" style={{ background: "linear-gradient(to left, var(--bg), transparent)" }} />
      </div>
    </section>
  );
}

type StackItem =
  | { name: string; slug: string; color: string; logo?: undefined }
  | { name: string; logo: "zai"; slug?: undefined; color?: undefined };

const STACK: StackItem[] = [
  { name: "React Native", slug: "react", color: "61DAFB" },
  { name: "Expo", slug: "expo", color: "FFFFFF" },
  { name: "Next.js", slug: "nextdotjs", color: "FFFFFF" },
  { name: "TypeScript", slug: "typescript", color: "3178C6" },
  { name: "Tailwind CSS", slug: "tailwindcss", color: "38BDF8" },
  { name: "Node.js", slug: "nodedotjs", color: "5FA04E" },
  { name: "Express", slug: "express", color: "FFFFFF" },
  { name: "FFmpeg", slug: "ffmpeg", color: "007808" },
  { name: "Z.ai", logo: "zai" },
  { name: "Vercel", slug: "vercel", color: "FFFFFF" },
];

function ZaiLogo({ size = 40 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/zai-logo.svg"
      alt="Z.ai"
      width={size}
      height={size}
      loading="lazy"
      className="select-none"
    />
  );
}

function Tech({ lang }: { lang: Lang }) {
  const c = COPY[lang].tech;
  return (
    <section id="tech" className="relative py-24 px-6" style={{ background: "var(--bg-soft)" }}>
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <div className="chip mb-3"><span style={{ color: "var(--coral)" }}>⚙</span> {c.chip}</div>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight" style={{ color: "var(--ink)" }}>
            {c.h2}
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {STACK.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 5) * 0.05, duration: 0.4 }}
              className="soft-card p-5 flex flex-col items-center justify-center gap-3 aspect-square hover:border-[rgba(255,36,66,0.25)] transition-colors"
            >
              {t.logo === "zai" ? (
                <div style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.25))" }}>
                  <ZaiLogo size={40} />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`https://cdn.simpleicons.org/${t.slug}/${t.color}`}
                  alt={t.name}
                  width={40}
                  height={40}
                  loading="lazy"
                  className="select-none"
                  style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.25))" }}
                />
              )}
              <div className="text-[12px] font-semibold text-center" style={{ color: "var(--ink)" }}>
                {t.name}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA({ lang }: { lang: Lang }) {
  const c = COPY[lang].cta;
  return (
    <section id="cta" className="relative py-28 px-6">
      <div className="max-w-5xl mx-auto soft-card p-10 sm:p-16 text-center relative overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(255, 36, 66, 0.12) 0%, rgba(255, 107, 129, 0.06) 100%)" }}>
        <motion.div
          className="absolute -top-8 -left-6 w-24 h-24 rounded-full float-y"
          style={{ background: "rgba(255, 217, 107, 0.18)" }}
        />
        <motion.div
          className="absolute -bottom-6 -right-4 w-20 h-20 rounded-3xl float-y-delay"
          style={{ background: "rgba(127, 216, 183, 0.18)" }}
        />

        <div className="relative">
          <div className="inline-flex w-20 h-20 rounded-3xl items-center justify-center text-4xl mb-6 shadow-xl" style={{ background: "var(--coral)" }}>
            🐼
          </div>
          <h2 className="text-4xl sm:text-6xl font-black tracking-tight" style={{ color: "var(--ink)" }}>
            {c.h2}
          </h2>
          <p className="mt-5 max-w-xl mx-auto text-[16px]" style={{ color: "var(--muted)" }}>
            {c.sub1}<b style={{ color: "var(--ink)" }}>{c.subBold}</b>{c.sub2}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-center">
            <a href="#" className="pill-red inline-flex items-center text-base px-7 py-3.5">
              {c.button}
              <span className="ml-2">→</span>
            </a>
            <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
              {c.note}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ lang }: { lang: Lang }) {
  const c = COPY[lang].footer;
  return (
    <footer className="py-12 px-6" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: "var(--coral)" }}>🐼</div>
          <span className="font-bold text-sm" style={{ color: "var(--ink)" }}>{lang === "zh" ? "熊猫书" : "PandaNote"}</span>
          <span className="text-xs" style={{ color: "var(--muted)" }}>{c.by}</span>
        </div>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {c.note}
        </span>
      </div>
    </footer>
  );
}

export default function Home() {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("sm-lang") : null;
    if (saved === "en" || saved === "zh") setLang(saved);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sm-lang", lang);
      document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    }
  }, [lang]);

  return (
    <main className="grain">
      <Navbar lang={lang} setLang={setLang} />
      <Hero lang={lang} />
      <FeedPreview lang={lang} />
      <Features lang={lang} />
      <VoiceMarquee lang={lang} />
      <Tech lang={lang} />
      <CTA lang={lang} />
      <Footer lang={lang} />
    </main>
  );
}
