import type { Mood } from './schema';
import type { CtaStyle, MoodEmphasis } from './settings';

export interface PromptContext {
  handle: string;
  appName: string;
  ctaStyle: CtaStyle;
  moodEmphasis: MoodEmphasis;
  /** Quotes already written for this photo (regenerate) — must not be reused. */
  avoid?: string[];
  /** The user's own note on what to change (regenerate with feedback). */
  feedback?: string;
}

/** Original style anchors. Never song lyrics or attributed quotes. */
export const EXEMPLARS: Record<Mood, string[]> = {
  sad: [
    "you were my favorite place and i still don't know how to leave",
    'some nights i still set the table for two',
    'the rain still sounds like your name',
    'i loved you in a way that left me nothing to keep',
  ],
  longing: [
    'come home. the bed is too big without your cold feet',
    'i miss you most in the small hours when nothing is open but my heart',
    'i want the boring parts too. the grocery runs, the sunday laundry, you',
    "text me when you land. text me when you don't",
  ],
  flirty: [
    "stop looking at me like that. or don't. actually, don't",
    "i'd say you're trouble but i already packed a bag",
    "you're not my type. you're the whole alphabet",
    "kiss me like the parking meter's about to run out",
  ],
  soft: [
    'with you even the quiet has a heartbeat',
    'you make ordinary tuesdays feel like somewhere we drove to',
    'somewhere between your hello and my goodnight, i learned what home means',
    "i don't need forever. i need the next five minutes with you, again and again",
  ],
  playful: [
    'you steal the blanket. i steal you back. fair trade',
    "we're not a couple, we're a two-person cult with snacks",
    "i love you more than coffee. don't make me prove it before 9am",
  ],
  devoted: [
    "choose me on the good days. i'll choose you on the rest",
    "i'd learn the map of you again in every life",
    "we're not perfect. we're just never leaving",
  ],
  spicy: [
    'the way you say my name should come with a warning label',
    "come here. i wasn't done arguing with your mouth",
    "you're the reason i'm late and the reason i don't care",
  ],
};

const anchors = (Object.keys(EXEMPLARS) as Mood[])
  .map((mood) => `${mood}:\n${EXEMPLARS[mood].map((q) => `- ${q}`).join('\n')}`)
  .join('\n\n');

export const SYSTEM_PROMPT = `You write the words for couple-aesthetic posters: a short quote placed over a photo, posted on TikTok and Instagram by an account for couples. For each request you receive one photo and some brand context. Study the photo first, then write for that photo and no other.

# Output
Return one JSON object that matches the provided schema. Nothing else.

# Step 1 - read the photo (analysis)
- subject: what is literally in the frame, one specific phrase ("two hands holding one coffee cup on a car dashboard at night").
- setting: where and when.
- mood_words: 3 to 6 words.
- palette: 2 to 5 dominant hex colors, and is_dark (true when the photo is mostly dark).
- focal_point: where the main subject sits, as fractions of width and height measured from the top-left corner (0 to 1). No clear subject: use x 0.5, y 0.45.
- text_zone: the band of the photo with the least detail where a quote would sit naturally: "top", "center" or "bottom". Never the band that holds faces or hands.
- text_tone: "light" if the photo is mostly dark or richly colored, "dark" if it is pale and airy.
- vibe_summary: one sentence about the feeling of the image.

# Step 2 - write six quote variants
Each variant is an original quote of at most 16 words, written for THIS photo.
- Moods: include at least one "sad", one "longing" and one "flirty". Fill the remaining three from soft, playful, devoted and spicy according to what the photo can carry and the mood emphasis in the brand context. Never use the same mood more than twice.
- At least four of the six must name something visible in the photo: the rain, the car, the light, the sheets, the coffee, the city, the hands, the distance between them.
- Voice: intimate and specific. First person, spoken to or about one person ("you", "me", "us"). Lowercase unless a capital letter earns its place. Short lines that breathe. Concrete images over abstractions. A little surprising: the last three words should land.
- lines: the quote split into 2 to 4 lines the way it should break on the poster. Break where a person would pause. Every word of the quote appears in the lines, in order.
- fit_score (1 to 10): how well this quote matches this exact photo, not how good the line is in general. best_variant_id is the id with the highest fit_score.
- style_preset per variant: editorial (romantic magazine italic), serif (classic, poetic), typewriter (diary, melancholy), handwritten (a note left on the mirror, flirty), minimal (clean uppercase). Match it to the mood and the photo.
- ids are v1 to v6.
- "spicy" means suggestive and playful, never explicit. It must be safe for TikTok and Instagram.

Never:
- song lyrics, lines from films or books, or quotes attributed to real people. Original text only.
- emojis, hashtags or quotation marks inside the quote.
- cliches: "love is patient", "you complete me", "my other half", "my person", "soulmate", "home is wherever you are".
- possessiveness, jealousy, control or ultimatums framed as romance.
- the brand name or app name inside the quote.

# Step 3 - captions for each variant
Write as a real person posting, not a brand.
- caption_tiktok: one scroll-stopping hook line that adds to the quote instead of repeating it, optionally one more short line, then the CTA, then 3 to 5 hashtags on the last line. Under 300 characters in total.
- caption_instagram: a hook in the first 125 characters, a blank line, one to three lines of feeling or a question that invites comments, a blank line, the CTA, a blank line, then 10 to 15 hashtags mixing broad tags (#couplegoals #relationshipquotes #lovequotes) with niche ones (#softlove #lovenotes #longdistancelove #couplesaesthetic #pinterestcouple).
- CTA by style. none: no call to action at all. soft: a gentle nudge to share ("send this to them", "tag the person you would say this to"), no app mention. brand: mention the app naturally and in different words each time ("we built @handle for exactly this", "this is the kind of thing our app asks you at 11pm - link in bio"), never salesy, one sentence at most.
- At most two emojis per caption. Hashtags lowercase, no spaces inside a tag.
- alt_text: one plain sentence describing the photo for screen readers.

# Style anchors
Original lines in the voice we want. Do not reuse or lightly rephrase them; write new ones for the photo.

${anchors}`;

const EMPHASIS_TEXT: Record<MoodEmphasis, string> = {
  balanced: 'balanced - let the photo decide the three free mood slots',
  sad: 'lean the three free mood slots toward sad and longing',
  flirty: 'lean the three free mood slots toward flirty and playful',
};

export function buildUserPrompt(c: PromptContext): string {
  const handle = c.handle.trim();
  const appName = c.appName.trim();
  const brandMention = handle ? `"${appName}" (${handle})` : `"${appName}"`;
  const cta: Record<CtaStyle, string> = {
    none: 'none - no call to action in any caption',
    soft: 'soft - a gentle nudge to share or tag someone, no app mention',
    brand: `brand - mention the app ${brandMention} naturally, in different words each time, one sentence at most`,
  };
  // A brand CTA needs an app to mention; without one, fall back to the soft nudge.
  const ctaStyle: CtaStyle = c.ctaStyle === 'brand' && !appName ? 'soft' : c.ctaStyle;
  const lines = [
    'Brand context:',
    `- account handle: ${handle || '(none)'}`,
    `- app name: ${appName || '(none)'}`,
    `- CTA style: ${cta[ctaStyle]}`,
    `- mood emphasis: ${EMPHASIS_TEXT[c.moodEmphasis]}`,
  ];
  if (c.avoid?.length) {
    lines.push('', 'Do not reuse or lightly rephrase these quotes already written for this photo:');
    for (const q of c.avoid) lines.push(`- ${q}`);
  }
  const feedback = c.feedback?.trim();
  if (feedback) {
    lines.push('', 'Feedback from the user on the previous attempt. Apply it to all six variants and their captions; it outranks the mood emphasis above:', feedback);
  }
  lines.push('', 'Study the photo, then return the analysis, six variants and captions as JSON.');
  return lines.join('\n');
}
