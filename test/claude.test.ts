import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { mapError, MODEL } from '../src/lib/claude';

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
