# Lovers in Tune · Quote Studio

Drop aesthetic (Pinterest-style) images → get couple-quote posters sized for TikTok and Instagram, plus captions for both platforms. Runs entirely in your browser; the quotes are written by Claude from the image itself, using your own API key.

**Live:** https://kiransilwal10.github.io/loversintune/

## How to use it

1. Open the site → **Settings** → paste your Anthropic API key (create one at https://console.anthropic.com → API keys). It is stored only in your browser's localStorage and sent straight to Anthropic — never to this site's servers (there are none).
2. Set your handle, app name, caption CTA style and quality.
3. Drop images (or paste one from the clipboard). Each image gets six quote variants across moods (sad, longing, flirty, soft, playful, devoted, spicy), ranked by fit, with a TikTok and an Instagram caption each.
4. Pick a variant, switch the platform tab, tweak font / position / size / backdrop, and download — or **Download all** for a zip with every poster and a `captions.md`.

Output sizes: TikTok / Reels / Stories 1080×1920, Instagram feed 1080×1350, Square 1080×1080. Text is kept inside each platform's safe zone.

## Cost

About $0.03–0.06 per image on `claude-opus-5` (the app shows a running estimate). "Fast" quality is cheaper and quicker; "Best" gives the strongest quotes.

## Privacy

Your API key and settings live in this browser only. Images never leave your machine except as a downscaled copy sent to Anthropic's API for the quote generation. Don't enter your key on a shared computer; use **Forget key** in Settings when done.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173/loversintune/
npm test             # Vitest unit tests
npm run build        # type-check + production build to dist/
```

Handy URLs while developing: `?fixture=1` uses a bundled sample result instead of calling Claude; add `&guides=1` to overlay safe zones and text bands on previews.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes `dist/` to GitHub Pages.
