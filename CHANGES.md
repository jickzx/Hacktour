# Hacktour — Change Summary for Handoff

## Branch: `vij/xhs-merge` → merged to `main`

---

## 1. Home Feed (XHS-style dark feed)

**File:** `mobile/src/screens/HomeScreen.tsx`

Complete rewrite of the home feed to mimic Xiaohongshu (rednote) aesthetic.

### Post types added to the `Post` interface:
- `imageSource` — local image asset (`require()`), displayed with `resizeMode="cover"`
- `imageOffsetY` — optional `translateY` to nudge the crop window
- `gradientCard` — dark gradient background with bold Chinese text overlay (mimics XHS video thumbnails)
- `textCard` — styled text-only card with custom bg/text colors

### Static posts (`STATIC_POSTS`) — 13 posts total:
| id  | Content                                   | Type                              |
|-----|-------------------------------------------|-----------------------------------|
| f1  | 伦敦市中心 £19.9 无限日料自助              | gradientCard                      |
| f2  | 4月可是 SummerIntern 捡漏黄金期            | imageSource (`summerintern.png`)  |
| f3  | claude code 团队模式                       | imageSource (`claude-code.png`)   |
| f4  | 一眼认出香港男生                           | gradientCard                      |
| f5  | rag 已死                                   | textCard                          |
| f6  | Title 越短，越大佬                         | gradientCard                      |
| f7  | 帝国理工造赛车 vlog                        | imageSource (`imperial-f1.png`)   |
| f8  | 上海00后UCL海归情侣                        | imageSource (`ucl-couple.png`)    |
| f9  | Cambridge/Harvard/Yale LinkedIn profiles   | imageSource (`linkedin-dalao.png`)|
| f10 | 香港中学入学难度                           | imageSource (`hk-school.png`)     |
| f11 | 剑桥IC offer holder被UCL拒绝 (UCAS page)  | imageSource (`ucas-offers.png`)   |
| f12 | 港大生在J.P. Morgan                        | imageSource (`jpmorgan.png`)      |
| f13 | 港三本有任何机会进Goldman Sachs吗          | imageSource (`goldman-question.png`) |

### Post rendering logic:
- Captions (title text) are **hidden** for `imageSource` posts — text is embedded in the screenshot
- Captions shown for `textCard`, `gradientCard`, and user clip posts

### Real clips integration:
- `useEffect` fetches `/api/clips` on mount and prepends user clips to the top of the feed

### Category chips: "For You", "Video", "Live", "Career", "Cars"

### Image assets (all in `mobile/assets/posts/`):
- `claude-code.png`, `imperial-f1.png`, `ucl-couple.png`, `hk-school.png` — user-cropped clean versions
- `jpmorgan.png` — clean JP Morgan event photo
- `summerintern.png`, `linkedin-dalao.png`, `ucas-offers.png`, `goldman-question.png` — new additions
- `london-food.png`, `hk-guy.png`, `title-dalao.png` — legacy gradient card sources

---

## 2. API Service

**File:** `mobile/src/services/api.ts`

### `safeJson` helper:
Wraps all `res.json()` calls. If the server returns HTML (e.g. expired ngrok tunnel), throws a friendly error:
> "Backend unreachable — check your ngrok tunnel is running"

### API_BASE:
```ts
const API_BASE =
  process.env.EXPO_PUBLIC_BACKEND_URL ??
  (Platform.OS === "web" ? "http://localhost:3001" : "http://localhost:3001");
```

### New endpoints added (from main merge):
- `uploadPhoto(params)` → `POST /api/photos`
- `listPhotos()` → `GET /api/photos`
- `editPhoto(photoId)` → `POST /api/photos/:id/edit`
- `photoUrl(relative)` — prepends API_BASE to relative photo URLs
- `identifyOutfit(uri)` → `POST /api/outfit`
- `Photo` and `OutfitItem` interfaces exported

All functions use `safeJson` for consistent error handling.

---

## 3. Library Screen

**File:** `mobile/src/screens/LibraryScreen.tsx`

Two-section screen:

### Clips tab:
- 2-column grid of saved AI edits
- Search bar with 300ms debounce → `/api/clips/search`
- Pull-to-refresh

### Photos tab (new):
- 2-column grid of photos captured during live streams
- "original" / "✨ cinematic" variant badge
- Loads from `/api/photos`

### Header:
- Fixed XHS-style top bar: ☰ | Library | ⌕
- Pill tab switcher (Clips / Photos) below header

---

## 4. App.tsx

**File:** `mobile/App.tsx`

- `SettingsScreen` tab added
- Global white text color hack (`Text.defaultProps`) for dark mode preserved
- `useEffect(() => { loadVoiceSettings(); }, [])` on mount
- `pull_up_clip` added to `AssistantAction` type

---

## 5. BottomNavBar

**File:** `mobile/src/components/BottomNavBar.tsx`

- `Tab` type: `"home" | "library" | "edit" | "live" | "settings"`
- Visual layout unchanged: Home | Library | FAB(+) | Edit | Profile

---

## 6. LiveStreamScreen

**File:** `mobile/src/screens/LiveStreamScreen.tsx`

Fixed missing imports after merge:
- `loadVoiceSettings`, `subscribeVoiceSettings` from `../services/voiceSettings`
- `uploadPhoto`, `editPhoto`, `identifyOutfit`, `OutfitItem`, `getVoiceSettings` from `../services/api`

---

## 7. Backend — Feed Router

**File:** `backend/src/index.ts`

`feedRouter` existed in `backend/src/routes/feed.ts` but was never mounted. Fixed:
```ts
import feedRouter from "./routes/feed";
app.use("/api", feedRouter);
```
`/api/feed` now serves AI-generated XHS-style trending posts.

---

## 8. Backend — Gemini Model

**Files:** `backend/src/index.ts`, `backend/src/services/glm.ts`

Default model is `gemini-3.1-flash`. If your API key returns 404 on v1beta, override in `backend/.env`:
```
GEMINI_MODEL=gemini-2.0-flash
```

---

## 9. Environment Variables

### `backend/.env`:
```
GEMINI_API_KEY=...    # Google AI Studio — transcription, chat AI, video composition,
                      # embeddings, photos, outfit scan, all Gemini features
GLM_API_KEY=...       # Z.AI — only for /api/feed Chinese trending posts
PORT=3001
GEMINI_MODEL=gemini-2.0-flash   # optional override if 3.1-flash not available on your key
```

### `mobile/.env`:
```
EXPO_PUBLIC_BACKEND_URL=https://your-ngrok-url.ngrok-free.app
```

---

## 10. Networking Notes

- Expo dev server on `eduroam`: use `npm run tunnel` (not `npm start`)
- Backend on `eduroam`: run `npx ngrok http 3001` in a **separate terminal** alongside `bun run dev`
- After ngrok restarts, update `EXPO_PUBLIC_BACKEND_URL` in `mobile/.env` and reload app
