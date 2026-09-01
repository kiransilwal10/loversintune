import { describe, it, expect, vi, beforeEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import fixture from './fixtures/sample-result.json';
import { mapError, MODEL, generateForImage, type GenerateArgs, type GenerateOutcome } from '../src/lib/claude';
import { normalizeResult } from '../src/lib/schema';

// Keep the real error classes (AnthropicError, APIError, ...) working for `instanceof`
// checks in mapError/generateForImage while replacing the client so no network is touched.
const parseMock = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>();
  class MockAnthropic {
    beta = { messages: { parse: parseMock } };
    constructor(_opts?: Record<string, unknown>) {}
  }
  const statics = [
    'AnthropicError', 'APIError', 'APIConnectionError', 'APIConnectionTimeoutError',
    'APIUserAbortError', 'RetryableError', 'NotFoundError', 'ConflictError',
    'RateLimitError', 'BadRequestError', 'AuthenticationError', 'InternalServerError',
    'PermissionDeniedError', 'UnprocessableEntityError',
  ] as const;
  for (const key of statics) {
    (MockAnthropic as unknown as Record<string, unknown>)[key] = (actual.default as unknown as Record<string, unknown>)[key];
  }
  return { ...actual, default: MockAnthropic };
});

function expectOk(outcome: GenerateOutcome): asserts outcome is Extract<GenerateOutcome, { ok: true }> {
  if (!outcome.ok) throw new Error(`expected ok outcome, got kind=${outcome.kind} message=${outcome.message}`);
}

const zeroUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const baseArgs: GenerateArgs = {
  apiKey: 'sk-test',
  effort: 'high',
  image: { base64: 'AAAA', mediaType: 'image/jpeg' },
  context: { handle: '@h', appName: 'App', ctaStyle: 'soft', moodEmphasis: 'balanced' },
};

describe('claude', () => {
  it('targets claude-opus-5', () => {
    expect(MODEL).toBe('claude-opus-5');
  });
  it('maps SDK errors to user-facing kinds', () => {
    const h = new Headers();
    expect(mapError(Anthropic.APIError.generate(401, { message: 'bad key' }, undefined, h)).kind).toBe('auth');
    expect(mapError(Anthropic.APIError.generate(429, { message: 'slow down' }, undefined, h)).kind).toBe('rate_limit');
    expect(mapError(Anthropic.APIError.generate(400, { message: 'nope' }, undefined, h))).toMatchObject({ kind: 'bad_request', message: expect.stringContaining('nope') });
    expect(mapError(Anthropic.APIError.generate(500, { message: 'boom' }, undefined, h)).kind).toBe('unknown');
    expect(mapError(new Anthropic.APIConnectionError({ message: 'offline' })).kind).toBe('network');
    expect(mapError(new Anthropic.APIUserAbortError()).kind).toBe('aborted');
    expect(mapError(new Error('weird'))).toEqual({ kind: 'unknown', message: 'weird' });
  });
});

describe('generateForImage', () => {
  beforeEach(() => {
    parseMock.mockReset();
  });

  it('parses a successful structured response into a GenerationResult and tallies usage', async () => {
    parseMock.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      stop_details: null,
      parsed_output: fixture,
      usage: { input_tokens: 100, output_tokens: 200, cache_read_input_tokens: 5, cache_creation_input_tokens: 7 },
    });

    const outcome = await generateForImage(baseArgs);
    expectOk(outcome);
    const expected = normalizeResult(fixture);
    expect(outcome.result.best_variant_id).toBe(expected.best_variant_id);
    expect(outcome.result.variants.length).toBe(expected.variants.length);
    expect(outcome.usage).toEqual({ input: 100, output: 200, cacheRead: 5, cacheWrite: 7 });

    expect(parseMock).toHaveBeenCalledTimes(1);
    const call = parseMock.mock.calls[0][0];
    expect(call.model).toBe('claude-opus-5');
    expect(call.fallbacks).toBe('default');
    const content = call.messages[0].content;
    expect(content[0].type).toBe('image');
    expect(content[1].type).toBe('text');
  });

  it('returns a refusal outcome with the explanation as the message', async () => {
    parseMock.mockResolvedValueOnce({
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: null, explanation: 'nope' },
      parsed_output: null,
      usage: zeroUsage,
    });

    const outcome = await generateForImage(baseArgs);
    expect(outcome).toMatchObject({ ok: false, kind: 'refusal', message: 'nope' });
  });

  it('retries once on malformed structured output, then reports invalid_output', async () => {
    parseMock
      .mockRejectedValueOnce(new Anthropic.AnthropicError('Failed to parse structured output: bad json'))
      .mockRejectedValueOnce(new Anthropic.AnthropicError('Failed to parse structured output: bad json'));

    const outcome = await generateForImage(baseArgs);
    expect(outcome).toMatchObject({ ok: false, kind: 'invalid_output' });
    expect(parseMock).toHaveBeenCalledTimes(2);
  });

  it('recovers when the retry after one malformed response succeeds', async () => {
    parseMock
      .mockRejectedValueOnce(new Anthropic.AnthropicError('Failed to parse structured output: bad json'))
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        stop_details: null,
        parsed_output: fixture,
        usage: zeroUsage,
      });

    const outcome = await generateForImage(baseArgs);
    expect(outcome.ok).toBe(true);
    expect(parseMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a real API error and maps it via mapError', async () => {
    parseMock.mockRejectedValueOnce(Anthropic.APIError.generate(429, { message: 'slow' }, undefined, new Headers()));

    const outcome = await generateForImage(baseArgs);
    expect(outcome).toMatchObject({ ok: false, kind: 'rate_limit' });
    expect(parseMock).toHaveBeenCalledTimes(1);
  });

  it('reports invalid_output without rejecting when a schema-valid payload fails normalizeResult', async () => {
    const tooFewVariants = { ...fixture, variants: fixture.variants.slice(0, 2) };
    parseMock
      .mockResolvedValueOnce({ stop_reason: 'end_turn', stop_details: null, parsed_output: tooFewVariants, usage: zeroUsage })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', stop_details: null, parsed_output: tooFewVariants, usage: zeroUsage });

    await expect(generateForImage(baseArgs)).resolves.toMatchObject({ ok: false, kind: 'invalid_output' });
    expect(parseMock).toHaveBeenCalledTimes(2);
  });
});
