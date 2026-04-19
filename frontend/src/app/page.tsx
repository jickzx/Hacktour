"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

const FEATURES = [
  {
    icon: "🐼",
    title: "Panda AI Co-Pilot",
    desc: "Voice-controlled assistant that manages your entire stream. Create polls, pull clips, change scenes — just say the word.",
    tag: "Live",
  },
  {
    icon: "✂️",
    title: "Instant AI Edits",
    desc: "Upload raw footage. Describe your edit in plain English. Get a polished video with transitions, subtitles, and color grading in seconds.",
    tag: "Edit",
  },
  {
    icon: "🎬",
    title: "Auto Clip Highlights",
    desc: "Panda watches your stream and identifies viral moments. One voice command creates a shareable clip with AI-generated titles.",
    tag: "Clips",
  },
  {
    icon: "📸",
    title: "AI Photo Sessions",
    desc: "Guided photo shoots during live streams. Panda suggests poses, captures frames, and enhances photos with cinematic AI editing.",
    tag: "Photos",
  },
  {
    icon: "👗",
    title: "Outfit Identifier",
    desc: "Point the camera at any outfit. Gemini identifies every piece and links to where viewers can buy them in real-time.",
    tag: "Shopping",
  },
  {
    icon: "🗣",
    title: "Real-Time Transcription",
    desc: "Every word spoken is transcribed, analyzed, and used to drive AI reactions, polls, and smart chat engagement automatically.",
    tag: "Voice",
  },
];

const STATS = [
  { value: "50ms", label: "AI Response Time" },
  { value: "6", label: "Gemini Models" },
  { value: "∞", label: "Creative Possibilities" },
  { value: "0", label: "Manual Editing Needed" },
];

const VOICE_COMMANDS = [
  { cmd: '"Panda, go live"', desc: "Start streaming instantly" },
  { cmd: '"Create a poll — cats or dogs?"', desc: "AI detects choices and launches a live poll" },
  { cmd: '"Clip this moment"', desc: "Saves a highlight reel clip automatically" },
  { cmd: '"Take my photo"', desc: "Guided photo session with pose suggestions" },
  { cmd: '"What am I wearing?"', desc: "Identifies outfit and links to shops" },
  { cmd: '"Pull up my cooking clip"', desc: "Searches library and overlays on stream" },
];

function Navbar() {
  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-0 left-0 right-0 z-50 glass"
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF2442] to-[#FF6B81] flex items-center justify-center">
            <span className="text-white text-sm font-bold">S</span>
          </div>
          <span className="text-white font-semibold tracking-tight text-lg">
            Stream Mind
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-[var(--muted-strong)] hover:text-white transition-colors text-sm">Features</a>
          <a href="#demo" className="text-[var(--muted-strong)] hover:text-white transition-colors text-sm">Demo</a>
          <a href="#tech" className="text-[var(--muted-strong)] hover:text-white transition-colors text-sm">Tech</a>
        </div>
        <a
          href="#cta"
          className="px-5 py-2 rounded-full bg-[var(--coral)] text-white text-sm font-semibold hover:bg-[var(--coral-dark)] transition-all hover:shadow-[0_0_20px_rgba(255,36,66,0.4)]"
        >
          Get Started
        </a>
      </div>
    </motion.nav>
  );
}

function Hero() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <section ref={ref} className="relative min-h-screen flex items-center justify-center hero-gradient overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--coral)] opacity-[0.03] rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[var(--coral-light)] opacity-[0.04] rounded-full blur-[100px]" />
        <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-purple-500 opacity-[0.03] rounded-full blur-[80px]" />
      </div>

      <motion.div style={{ y, opacity }} className="relative z-10 max-w-5xl mx-auto px-6 text-center pt-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass mb-8"
        >
          <span className="w-2 h-2 rounded-full bg-[var(--coral)] animate-pulse" />
          <span className="text-xs font-medium text-[var(--muted-strong)] tracking-wide uppercase">
            Powered by Gemini AI
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tight leading-[0.95] mb-6"
        >
          <span className="text-white">Your stream.</span>
          <br />
          <span className="shimmer-text">Supercharged.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="text-lg sm:text-xl text-[var(--muted-strong)] max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          AI co-pilot, instant edits, viral clips, live polls — all in real-time.
          Meet <span className="text-white font-semibold">Panda</span>, the assistant that runs your stream so you can focus on creating.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a
            href="#cta"
            className="group relative px-8 py-3.5 rounded-full bg-gradient-to-r from-[var(--coral)] to-[var(--coral-light)] text-white font-semibold text-base hover:shadow-[0_0_40px_rgba(255,36,66,0.5)] transition-all duration-300"
          >
            Start Streaming Free
            <span className="ml-2 inline-block group-hover:translate-x-1 transition-transform">→</span>
          </a>
          <a
            href="#demo"
            className="px-8 py-3.5 rounded-full glass text-white font-medium text-base hover:text-[var(--coral-light)] transition-all"
          >
            See it in action
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 1 }}
          className="mt-20 relative"
        >
          <div className="relative mx-auto max-w-3xl aspect-video rounded-2xl overflow-hidden glass shadow-[0_0_80px_rgba(255,36,66,0.1)]">
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--surface)] to-[var(--surface-elevated)]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 mx-auto rounded-full bg-[var(--coral)] flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(255,36,66,0.5)]">
                  <span className="text-3xl">🐼</span>
                </div>
                <p className="text-[var(--muted)] text-sm font-mono">Live stream preview</p>
              </div>
            </div>
            <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--coral)]">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="text-white text-xs font-bold tracking-wider">LIVE</span>
              </div>
              <div className="flex-1 glass rounded-full px-4 py-2">
                <p className="text-white/60 text-xs font-mono truncate">Panda: "Great energy today! Want me to clip that moment?"</p>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="text-[var(--muted)]"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </motion.div>
      </div>
    </section>
  );
}

function Stats() {
  return (
    <section className="relative py-20 border-y border-white/5">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.6 }}
              className="text-center"
            >
              <div className="text-4xl md:text-5xl font-bold text-white mb-2 font-mono">
                {stat.value}
              </div>
              <div className="text-sm text-[var(--muted-strong)] tracking-wide">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="relative py-28 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 section-divider" />
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <span className="text-[var(--coral)] text-sm font-semibold tracking-widest uppercase mb-4 block">
            Features
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
            Everything you need.<br />
            <span className="text-[var(--muted-strong)]">Nothing you don&apos;t.</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              className="group glass card-glow rounded-2xl p-6 hover:bg-white/[0.04] transition-all duration-500"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-3xl">{f.icon}</span>
                <span className="text-[10px] font-bold tracking-widest uppercase text-[var(--coral)] bg-[var(--coral)]/10 px-2.5 py-1 rounded-full">
                  {f.tag}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-[var(--muted-strong)] leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function VoiceDemo() {
  return (
    <section id="demo" className="relative py-28">
      <div className="absolute top-0 left-0 right-0 section-divider" />
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-[var(--coral)] text-sm font-semibold tracking-widest uppercase mb-4 block">
            Voice Commands
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
            Just say the word.
          </h2>
          <p className="text-[var(--muted-strong)] max-w-xl mx-auto">
            Panda understands natural language. No menus, no buttons — just speak.
          </p>
        </motion.div>

        <div className="space-y-3">
          {VOICE_COMMANDS.map((cmd, i) => (
            <motion.div
              key={cmd.cmd}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="group glass rounded-xl p-5 flex items-center gap-5 hover:bg-white/[0.04] transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-full bg-[var(--coral)]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--coral)]/20 transition-colors">
                <span className="text-[var(--coral)] text-lg">🐼</span>
              </div>
              <div className="flex-1 min-w-0">
                <code className="text-white font-mono text-sm">{cmd.cmd}</code>
                <p className="text-[var(--muted)] text-sm mt-1">{cmd.desc}</p>
              </div>
              <div className="hidden sm:block">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-[var(--muted)] group-hover:text-[var(--coral)] transition-colors">
                  <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TechStack() {
  const MODELS = [
    { name: "Gemini 2.0 Flash", role: "Real-time transcription & chat", color: "#4285F4" },
    { name: "Gemini 2.0 Flash-Lite", role: "Fast assistant responses", color: "#34A853" },
    { name: "Gemini Live", role: "WebSocket voice streaming", color: "#FF2442" },
    { name: "Gemini Vision", role: "Scene analysis & outfit ID", color: "#FFB347" },
    { name: "Gemini Embedding", role: "Semantic clip search", color: "#A855F7" },
    { name: "GLM-4", role: "Feed content generation", color: "#00C853" },
  ];

  return (
    <section id="tech" className="relative py-28">
      <div className="absolute top-0 left-0 right-0 section-divider" />
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-[var(--coral)] text-sm font-semibold tracking-widest uppercase mb-4 block">
            Under the Hood
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
            Built on the best.
          </h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODELS.map((model, i) => (
            <motion.div
              key={model.name}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              className="glass rounded-xl p-5 group hover:bg-white/[0.04] transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: model.color }} />
                <span className="text-white font-semibold text-sm">{model.name}</span>
              </div>
              <p className="text-[var(--muted-strong)] text-xs pl-6">{model.role}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-12 glass rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <div>
            <h3 className="text-white font-semibold text-lg mb-2">Open Source Stack</h3>
            <p className="text-[var(--muted-strong)] text-sm">React Native + Expo + Express + TypeScript + ffmpeg + WebSockets</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            {["React Native", "Expo", "Express", "TypeScript", "ffmpeg", "WS"].map((tech) => (
              <span key={tech} className="px-3 py-1.5 rounded-full bg-white/5 text-[var(--muted-strong)] text-xs font-mono border border-white/10">
                {tech}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section id="cta" className="relative py-32">
      <div className="absolute top-0 left-0 right-0 section-divider" />
      <div className="absolute inset-0 hero-gradient opacity-50" />
      <div className="relative max-w-3xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div className="text-6xl mb-6">🐼</div>
          <h2 className="text-4xl md:text-6xl font-bold text-white tracking-tight mb-6">
            Ready to stream<br />
            <span className="glow-text">like never before?</span>
          </h2>
          <p className="text-[var(--muted-strong)] text-lg mb-10 max-w-xl mx-auto">
            Join the next generation of live content creators. No setup fees. No limits. Just you, your stream, and Panda.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button className="group px-10 py-4 rounded-full bg-gradient-to-r from-[var(--coral)] to-[var(--coral-light)] text-white font-bold text-lg hover:shadow-[0_0_60px_rgba(255,36,66,0.5)] transition-all duration-300">
              Launch Stream Mind
              <span className="ml-2 inline-block group-hover:translate-x-1 transition-transform">→</span>
            </button>
            <span className="text-[var(--muted)] text-sm">Free during beta</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[var(--coral)] to-[var(--coral-light)] flex items-center justify-center">
              <span className="text-white text-xs font-bold">S</span>
            </div>
            <span className="text-white font-semibold text-sm">Stream Mind</span>
            <span className="text-[var(--muted)] text-xs">by Hacktour</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-[var(--muted)] text-xs">London Global Hacktour 2026</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <main className="grain">
      <Navbar />
      <Hero />
      <Stats />
      <Features />
      <VoiceDemo />
      <TechStack />
      <CTA />
      <Footer />
    </main>
  );
}
