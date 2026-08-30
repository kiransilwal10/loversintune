# Lovers in Tune — Quote Studio: Design Spec

**Date:** 2026-08-30
**Status:** Draft for review
**Owner:** Kiran (kiransilwal10)

## 1. Purpose

A static web app where you drop aesthetic (Pinterest-style) images and get back ready-to-post couple-quote posters for TikTok and Instagram, plus platform-specific captions. It exists to feed the UGC accounts that market the Lovers in Tune couples app, so output quality (quote-to-image fit, typography, legibility, correct sizes) matters more than features.

Decisions already made:

- Quote engine: **Claude vision API** (`claude-opus-5`) with the user's own API key, entered in the app and stored only in the browser.
- Hosting: **public GitHub repo `kiransilwal10/loversintune` deployed to GitHub Pages** via GitHub Actions. No server.

## 2. User flow

1. **First run:** open Settings, paste Anthropic API key, set brand handle (e.g. `@loversintune`), app name, CTA style. Saved to `localStorage`.
2. **Drop images** (one or many; JPG/PNG/WebP). Each becomes a card in a queue and is processed automatically, at most 2 at a time.
3. **Per image, automatically:**
   - image is downscaled in the browser (≤1024px longest edge, JPEG) and sent to Claude with the brand context;
   - Claude returns an image analysis + **6 quote variants** across moods (ranked by fit) with per-variant TikTok and Instagram captions;
   - the app renders the best-fit variant onto the **original full-resolution** image in every enabled platform size and shows a preview.
4. **Per card, the user can:** switch variant (mood chips), switch platform tab (TikTok 9:16 / IG 4:5 / Square 1:1), change typography preset, nudge text zone (auto/top/center/bottom), text size (S/M/L), scrim strength (auto/lighter/stronger), regenerate quotes, download any single poster, copy either caption, or download that card's zip.
5. **Batch:** "Download all" zips every card's posters and a `captions.md`.

Nothing leaves the browser except the downscaled image + prompt sent to Anthropic's API.

## 3. Architecture

Single-page app, **Vite + React + TypeScript**, no backend.

```
loversintune/
  index.html
  package.json  tsconfig.json  vite.config.ts   (base: '/loversintune/')
  .github/workflows/deploy.yml                  (build → deploy to Pages on push to main)
  src/
    main.tsx  App.tsx  styles.css
    lib/
      settings.ts    Settings type, load/save/clear (localStorage key lit.settings.v1)
      imagePrep.ts   File → {bitmap, width, height, apiBase64, apiMediaType, lumaGrid}
      schema.ts      Zod schema for the Claude response + inferred TS types
      prompt.ts      buildSystemPrompt(), buildUserPrompt(settings) + exemplar quotes
      claude.ts      generateForImage(prepared, settings, signal) → GenerationResult
      layout.ts      platform presets, safe zones, crop rect, zone scoring, text fitting
      fonts.ts       typography presets + ensureFontsLoaded(preset)
      render.ts      renderPoster(source, variant, preset, platform, options) → HTMLCanvasElement
      download.ts    saveBlob, buildCardZip, buildBatchZip, captionsMarkdown
      queue.ts       runWithConcurrency(limit) job runner with cancel
    components/
      SettingsDrawer.tsx  Dropzone.tsx  PosterCard.tsx  VariantChips.tsx
      PlatformTabs.tsx  CaptionBox.tsx  StyleControls.tsx  BatchBar.tsx
  test/            vitest unit tests for lib/* (pure modules)
  test/fixtures/   sample-result.json (a valid Claude response) for tests + render checks
```

Data flow per image:

```
File ──imagePrep──▶ Prepared ──claude.generateForImage──▶ GenerationResult (analysis + 6 variants)
  │                                                                  │
  └──────────────── original bitmap ──────────┐                      ▼
                                              ▼             selected variant + user overrides
                                     render.renderPoster ◀───────────┘
                                              │
                                              ▼
                                   canvas → Blob (JPG/PNG) → preview / download / zip
```

Module boundaries: `layout.ts`, `prompt.ts`, `schema.ts`, `queue.ts`, `download.captionsMarkdown` are pure (no DOM) and unit-tested. `render.ts` and `imagePrep.ts` touch Canvas and are verified in a real browser. `claude.ts` is the only module that knows about the SDK.

## 4. Claude integration (`claude.ts`, `prompt.ts`, `schema.ts`)

- SDK: `@anthropic-ai/sdk` in the browser with `dangerouslyAllowBrowser: true` (the SDK sets the header Anthropic requires for browser calls). Client is created per call from the stored key; no key, no call.
- Model: `claude-opus-5`. Adaptive thinking (default). `output_config.effort` from settings: Fast=`low`, Balanced=`medium`, Best=`high` (default **Best** — quote quality outranks latency here; a card may take 30–60 s). `max_tokens: 16000` (the JSON is ~1.5–2.5k tokens, but thinking tokens count against the cap).
- Refusal fallbacks enabled by default: `client.beta.messages.create` with `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`. If the final `stop_reason` is `refusal`, the card shows "Claude declined this image" with the explanation.
- Structured output: `output_config.format` built with `zodOutputFormat(GenerationSchema)`; the text block is `JSON.parse`d and validated with the same Zod schema. One automatic retry on parse/validation failure, then a visible error with a Retry button.
- Request shape: `system` = stable brand-voice prompt (frozen text, `cache_control: {type: "ephemeral"}` so a batch reuses the cached prefix); `messages[0]` = `[image (base64 JPEG ≤1024px), text (per-run context: brand handle, app name, CTA style, mood emphasis, enabled platforms)]`.
- Errors surface by type: `AuthenticationError` → "Check your API key in Settings"; `RateLimitError` (after the SDK's built-in retries) → "Rate limited — retry in a moment"; `BadRequestError` → message text; `APIConnectionError` → "Network error"; anything else → generic with the message. Every failed card has a Retry button; failures never block other cards.
- Concurrency: 2 requests in flight; cancel button per card aborts via `AbortSignal`.

### 4.1 Response schema

```ts
Analysis {
  subject: string            // "two hands holding a coffee cup in a car at night"
  setting: string
  mood_words: string[3..6]
  palette: { dominant_hex: string[2..5], is_dark: boolean }
  focal_point: { x: number, y: number }        // 0..1, where the subject is — drives smart crop
  text_zone: 'top' | 'center' | 'bottom'       // Claude's suggestion; the renderer may override
  text_tone: 'light' | 'dark'                  // light text on dark scrim, or the reverse
  vibe_summary: string
}
Variant {
  id: string
  mood: 'sad' | 'longing' | 'flirty' | 'soft' | 'playful' | 'devoted' | 'spicy'
  quote: string              // ≤ 16 words, original, no emojis, no quotation marks
  lines: string[2..4]        // suggested line breaks; renderer honors them when they fit
  fit_score: number          // 1..10 — how well it matches THIS image
  why_it_fits: string
  style_preset: 'editorial' | 'handwritten' | 'minimal' | 'typewriter' | 'serif'
  caption_tiktok: string     // hook (+ optional 2nd line) + CTA + 3–5 hashtags, ≤ 300 chars
  caption_instagram: string  // hook line, blank line, 1–3 lines, CTA with handle, blank line, 10–15 hashtags
}
GenerationResult { analysis, variants: Variant[6], best_variant_id, alt_text }
```

### 4.2 Prompt rules (system prompt, summarized)

- Voice: intimate, specific, modern Pinterest/TikTok couple aesthetic; first-person "you / me / us"; lowercase preferred; short lines that breathe.
- Must reference something visible in the image (rain, the car, hands, the light, the city) in at least 4 of 6 variants — no generic quotes.
- Mood mix per image: at least one `sad`, one `longing`, one `flirty`; remaining three chosen by fit (`soft`, `playful`, `devoted`, `spicy`). `spicy` stays PG-13 and platform-safe. Mood emphasis setting (Balanced / More sad & longing / More flirty & playful) shifts the remaining three.
- Hard rules: original text only — never song lyrics, never quotes attributed to real people; no emojis or quotation marks in poster text; no clichés ("love is patient", "you complete me", "my other half"); nothing possessive, jealous, or controlling framed as romantic; no brand mention inside the quote.
- Captions: sound like a person, not a brand. TikTok = one scroll-stopping hook line, optional second line, a soft CTA, 3–5 hashtags. Instagram = hook in the first 125 characters, a line or two of feeling or a question that invites comments, CTA, 10–15 hashtags mixing broad (#couplegoals #relationshipquotes) and niche (#softlove #lovenotes). CTA style from settings: `none` / `soft` ("send this to them") / `brand` ("we made an app for exactly this — @handle, link in bio"), varied in wording each time. At most 2 emojis per caption.
- ~25 original exemplar quotes across the moods are included as style anchors.
- `fit_score` ranks variants; `best_variant_id` is what the card renders first.

Cost per image: roughly 1.2–1.6k input tokens (image + context) + cached system prompt + ~2k output tokens ≈ **$0.03–0.06** on Opus 5.

## 5. Rendering (`layout.ts`, `fonts.ts`, `render.ts`)

This is where "the image and quotes are proper" is won or lost.

### 5.1 Platform presets

| Preset | Size | Used for | Text safe zone (inset: top / bottom / sides) |
|---|---|---|---|
| `tiktok` | 1080×1920 (9:16) | TikTok, IG Reels, IG/TikTok Stories | 300 / 420 / 130 — clears TikTok's header, right-hand icon column, caption/sound area, and stays inside IG's 4:5 feed preview of a Reel |
| `ig-portrait` | 1080×1350 (4:5) | Instagram feed (default) | 80 / 80 / 80 |
| `square` | 1080×1080 (1:1) | Instagram feed / carousel, Pinterest repost | 80 / 80 / 80 |

Default enabled: `tiktok` + `ig-portrait`; `square` optional in settings. Output is always exactly these pixel sizes.

### 5.2 Smart crop

Cover-fit the original image into the target aspect ratio; position the crop window so Claude's `focal_point` is as close to the window's center as the bounds allow (clamped). If the analysis is missing, center-crop with a slight upward bias (0.42 vertical) for portrait targets. Sources narrower than 900px get a "low-res source" badge on the card (still rendered).

### 5.3 Text zone selection

Candidate zones: `top`, `center`, `bottom` bands inside the safe area. Each is scored by **busyness** (mean local luminance variance from `lumaGrid`, computed once in `imagePrep` on a 24×24 downscale, normalized 0–1) plus a +0.2 penalty if the band contains the focal point. Claude's `text_zone` is used unless its score exceeds the best-scoring band's by more than 0.15, in which case the best band wins. The user's manual zone override always wins.

### 5.4 Legibility

- `text_tone` decides light text (near-white `#FAF7F2`) or dark text (`#1E1B18`). Before drawing, the renderer computes for **both** tones the scrim opacity needed to reach 4.5:1 contrast over the chosen zone; Claude's tone is kept unless it needs more than 0.60 opacity while the other tone needs at most 0.40, in which case the tone flips.
- A **scrim** (linear gradient centered on the text block, extending 1.6× the block height with soft falloff; black for light text, warm cream for dark text) is drawn under the text. Starting opacity = `clamp(0.18 + busyness × 0.5, 0.18, 0.55)`; user override: lighter (−0.12) / stronger (+0.15). The renderer measures the scrimmed zone's mean luminance and raises opacity in 0.05 steps (cap 0.75) until the contrast ratio against the text color is ≥ 4.5:1.
- A subtle full-frame vignette (8%) unifies the look. Light text gets a soft shadow (`rgba(0,0,0,.35)`, blur 14px); dark text gets none.

### 5.5 Typography presets (Google Fonts, loaded via CSS; `ensureFontsLoaded` awaits `document.fonts.load` for each face before drawing — a first render must never fall back to a system font)

| Preset | Face | Feel | Claude tends to pick for |
|---|---|---|---|
| `editorial` | Playfair Display italic 500 | magazine, romantic | soft, devoted |
| `serif` | Cormorant Garamond 500, large, with a decorative open-quote glyph | classic, poetic | longing, sad |
| `typewriter` | Courier Prime | diary, melancholic | sad |
| `handwritten` | Caveat 600 | note-on-the-mirror, flirty | flirty, playful |
| `minimal` | Manrope 400, uppercase, +0.12em tracking, smaller | clean aesthetic | spicy, playful |

Base size by platform (auto-fit shrinks toward the minimum): tiktok 62px (min 40), ig-portrait 56px (min 38), square 52px (min 36); `minimal` runs 0.72× these. Size control: S ×0.85 / M ×1 / L ×1.15. Line height 1.3. Max width = safe width. Fitting: honor `lines` if every line fits at the current size; otherwise shrink; below the minimum, re-wrap by words to ≤ 6 lines.

### 5.6 Attribution / watermark

If enabled (default on), the brand handle is drawn as an attribution line under the quote: 24px `minimal` face, letter-spaced, 75% opacity, tone-matched. Filename pattern: `<source-stem>-<mood>-<preset>.jpg`.

### 5.7 Export

`canvas.toBlob`: JPEG quality 0.92 by default (~0.4–0.8 MB; platforms recompress anyway), PNG optional in settings. Previews are rendered at half size for speed; downloads always render at full size.

## 6. UI

- **Top bar:** app name, mood-emphasis select (persisted with the other settings), running cost estimate for this session (from `usage` × Opus 5 rates), "Download all", Settings gear (badge if no key).
- **Dropzone:** drag-and-drop or click; accepts multiple files; unsupported types produce a toast and are skipped.
- **Cards** (newest first): state machine `queued → preparing → generating → rendering → ready | error | declined`. A ready card shows the preview with platform tabs, six mood chips (best first, with fit score), style controls, two caption boxes with Copy buttons, per-file download buttons, card zip, Regenerate, Remove.
- **Settings drawer:** API key (masked, with Forget), brand handle, app name, CTA style, effort (Fast/Balanced/Best), enabled platforms, export format, attribution on/off, warning that the key lives in this browser and shouldn't be entered on shared machines.
- Visual style of the tool itself: warm off-white, one accent (rose), lots of whitespace, system font — the posters are the stars, the UI stays quiet. Works down to a 390px-wide phone screen.

## 7. Downloads (`download.ts`)

- Single file: Blob URL + anchor click.
- Card zip / batch zip via `jszip` (client-side): `<stem>/<stem>-<mood>-tiktok.jpg`, `…-ig-portrait.jpg`, `…-square.jpg`, `captions.md`. Batch zip adds a top-level `captions.md` listing every card. `captionsMarkdown` includes the quote, mood, TikTok caption, Instagram caption, and alt text.
- Zip builds render the currently selected variant of each card at full size.

## 8. Settings & persistence

`localStorage["lit.settings.v1"]`: `{ apiKey, handle, appName, ctaStyle, moodEmphasis, effort, platforms, exportFormat, attribution }`. Generated results and images live in memory only (a refresh clears them). Versioned key so a future shape change can migrate.

## 9. Error handling summary

| Failure | Behavior |
|---|---|
| Unsupported / undecodable file | toast, file skipped |
| No API key | cards queue but don't start; banner links to Settings |
| Auth / rate limit / network / bad request | card error with specific message + Retry |
| Refusal | card "declined" with explanation, no retry loop |
| Invalid JSON / schema | one silent retry, then error + Retry |
| Font fails to load | render proceeds with a serif system fallback; console warning |
| Zip fails | per-file downloads still work; toast |

## 10. Testing

- **Unit (vitest, jsdom not needed):** `layout` (crop rect for every preset/focal point incl. clamping; safe-zone insets; zone scoring picks the calmest band; text fitting shrinks then re-wraps; contrast helper), `schema` (fixture parses; bad shapes fail), `prompt` (system prompt is byte-stable across calls; user prompt carries handle/CTA/mood emphasis; exemplar quotes contain no emojis or quotation marks), `queue` (concurrency limit, cancellation), `download.captionsMarkdown`.
- **Render verification (real browser):** opening the app with `?fixture=1` makes it skip the API call and use `test/fixtures/sample-result.json` for any image you drop, so the full render path (crop, zones, scrim, every preset and style) can be inspected without a key; `&guides=1` overlays the safe zones. I will run this in Chrome with a few test images and check each preset before calling the renderer done.
- **Live check:** one real end-to-end run against the API with your key (you paste it in the deployed or local app) — not automated, since no credential is stored in the repo.

## 11. Deployment

- `vite.config.ts` → `base: '/loversintune/'`.
- `.github/workflows/deploy.yml`: on push to `main` → `npm ci` → `npm run build` → `actions/upload-pages-artifact` (`dist`) → `actions/deploy-pages`. Pages source set to "GitHub Actions" via `gh api`.
- Repo created public as `kiransilwal10/loversintune`; site at `https://kiransilwal10.github.io/loversintune/`.
- README: what it does, get an API key at console.anthropic.com, cost per image, privacy note, local dev (`npm run dev`), deploy notes.

## 12. Non-goals (v1)

No accounts or server, no auto-posting or scheduling, no video, no persistence of generated results across refreshes, no offline quote bank, no HEIC decoding, no manual text editing of the quote on the canvas (regenerate/switch variants instead), no per-word styling.

## 13. Open risks

- **Key in the browser:** acceptable for a personal tool; documented; Forget button provided.
- **Rate limits / cost on big batches:** concurrency 2 and a visible running cost estimate on the batch bar (tokens from `usage` × Opus 5 rates) keep it predictable.
- **Font loading on canvas** is the classic silent failure; handled by awaiting `document.fonts.load` per face and covered by the fixture render check.
- **Beta endpoint + structured output:** the plan pairs `fallbacks: "default"` (beta) with `output_config.format`. If the beta endpoint rejects that combination, the fallback plan is the non-beta `client.messages.parse` without server-side fallbacks; refusals are then just surfaced to the user.
- **No local credential for me to test with:** there is no `ant` CLI login or `ANTHROPIC_API_KEY` on this machine, so the live end-to-end run needs your key pasted into the app; everything else is verified without it.
