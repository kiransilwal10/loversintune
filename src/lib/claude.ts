import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { GenerationSchema, normalizeResult, type GenerationResult } from './schema';
import { SYSTEM_PROMPT, buildUserPrompt, type PromptContext } from './prompt';
import type { Effort } from './settings';
import { EMPTY_USAGE, addUsage, type UsageSummary } from './usage';

export const MODEL = 'claude-opus-5';
const MAX_TOKENS = 16000;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const OUTPUT_FORMAT = zodOutputFormat(GenerationSchema);

export type FailureKind = 'auth' | 'rate_limit' | 'bad_request' | 'network' | 'refusal' | 'invalid_output' | 'aborted' | 'unknown';
export type GenerateOutcome =
  | { ok: true; result: GenerationResult; usage: UsageSummary }
  | { ok: false; kind: FailureKind; message: string; usage?: UsageSummary };

export interface GenerateArgs {
  apiKey: string;
  effort: Effort;
  image: { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' };
  context: PromptContext;
  signal?: AbortSignal;
}

export function mapError(err: unknown): { kind: FailureKind; message: string } {
  if (err instanceof Anthropic.APIUserAbortError) return { kind: 'aborted', message: 'Cancelled' };
  if (err instanceof Anthropic.AuthenticationError) return { kind: 'auth', message: 'Anthropic rejected the API key. Check it in Settings.' };
  if (err instanceof Anthropic.RateLimitError) return { kind: 'rate_limit', message: 'Rate limited by Anthropic. Wait a moment and retry.' };
  if (err instanceof Anthropic.BadRequestError) return { kind: 'bad_request', message: `Request rejected: ${err.message}` };
  if (err instanceof Anthropic.APIConnectionError) return { kind: 'network', message: 'Network error reaching Anthropic. Check your connection and retry.' };
  if (err instanceof Anthropic.APIError) return { kind: 'unknown', message: `Anthropic error ${err.status ?? ''}: ${err.message}`.replace('  ', ' ') };
  return { kind: 'unknown', message: err instanceof Error ? err.message : String(err) };
}

/** One image in, analysis + six variants + captions out. Retries once on malformed JSON. */
export async function generateForImage(a: GenerateArgs): Promise<GenerateOutcome> {
  let usage = EMPTY_USAGE;
  try {
    const client = new Anthropic({ apiKey: a.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
    const userPrompt = buildUserPrompt(a.context);
    for (let attempt = 0; attempt < 2; attempt++) {
      let res;
      try {
        res = await client.beta.messages.parse(
          {
            model: MODEL,
            max_tokens: MAX_TOKENS,
            betas: [FALLBACK_BETA],
            fallbacks: 'default',
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'image', source: { type: 'base64', media_type: a.image.mediaType, data: a.image.base64 } },
                  { type: 'text', text: userPrompt },
                ],
              },
            ],
            output_config: { effort: a.effort, format: OUTPUT_FORMAT },
          },
          { signal: a.signal },
        );
      } catch (e) {
        // The SDK throws AnthropicError (not APIError) on malformed JSON / schema
        // mismatch instead of resolving with a null parsed_output — retry once.
        if (e instanceof Anthropic.AnthropicError && !(e instanceof Anthropic.APIError)) {
          if (attempt === 0) continue;
          return { ok: false, kind: 'invalid_output', message: `Claude's answer did not match the expected shape: ${e.message}`, usage };
        }
        throw e; // real API errors go to mapError via the outer catch
      }
      usage = addUsage(usage, {
        input: res.usage.input_tokens,
        output: res.usage.output_tokens,
        cacheRead: res.usage.cache_read_input_tokens ?? 0,
        cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
      });
      if (res.stop_reason === 'refusal') {
        return { ok: false, kind: 'refusal', message: res.stop_details?.explanation ?? 'Claude declined to write for this image.', usage };
      }
      try {
        if (res.parsed_output) return { ok: true, result: normalizeResult(res.parsed_output), usage };
      } catch (e) {
        if (attempt === 1) return { ok: false, kind: 'invalid_output', message: `Claude's answer did not match the expected shape: ${e instanceof Error ? e.message : String(e)}`, usage };
      }
    }
    return { ok: false, kind: 'invalid_output', message: 'Claude returned an unexpected format twice. Retry.', usage };
  } catch (err) {
    return { ok: false, ...mapError(err), usage };
  }
}
