import { describe, it, expect } from 'vitest';
import fixture from './fixtures/sample-result.json';
import { newCards, uniqueStem, cardsReducer, selectedVariant, SIZE_SCALE } from '../src/state/cards';
import { normalizeResult } from '../src/lib/schema';

const file = (name: string) => new File(['x'], name, { type: 'image/jpeg' });
const usage = { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 };

describe('cards state', () => {
  it('newCards gives unique stems and queued status', () => {
    const cards = newCards([file('a.jpg'), file('a.jpg'), file('b.png')], ['b']);
    expect(cards.map((c) => c.stem)).toEqual(['a', 'a-2', 'b-2']);
    expect(cards.every((c) => c.status === 'queued' && c.style === 'auto' && c.zone === 'auto' && c.size === 'M' && c.scrim === 'auto')).toBe(true);
    expect(new Set(cards.map((c) => c.id)).size).toBe(3);
    expect(uniqueStem('x', ['x', 'x-2'])).toBe('x-3');
  });
  it('add prepends newest first', () => {
    const [a] = newCards([file('a.jpg')], []);
    const [b] = newCards([file('b.jpg')], ['a']);
    const state = cardsReducer(cardsReducer([], { type: 'add', cards: [a] }), { type: 'add', cards: [b] });
    expect(state.map((c) => c.stem)).toEqual(['b', 'a']);
  });
  it('result marks the card ready, selects the best variant and accumulates usage', () => {
    const [c] = newCards([file('a.jpg')], []);
    let state = cardsReducer([c], { type: 'result', id: c.id, result: normalizeResult(fixture), usage });
    expect(state[0].status).toBe('ready');
    expect(state[0].selectedVariantId).toBe('v1');
    expect(selectedVariant(state[0])?.id).toBe('v1');
    state = cardsReducer(state, { type: 'result', id: c.id, result: normalizeResult(fixture), usage });
    expect(state[0].usage).toEqual({ input: 20, output: 40, cacheRead: 0, cacheWrite: 0 });
  });
  it('error keeps usage and supports a declined status', () => {
    const [c] = newCards([file('a.jpg')], []);
    const state = cardsReducer([c], { type: 'error', id: c.id, message: 'no', status: 'declined', usage });
    expect(state[0]).toMatchObject({ status: 'declined', error: 'no', usage });
  });
  it('status clears a previous error; options and variant selection patch the card; remove drops it', () => {
    const [c] = newCards([file('a.jpg')], []);
    let state = cardsReducer([c], { type: 'error', id: c.id, message: 'x' });
    state = cardsReducer(state, { type: 'status', id: c.id, status: 'generating' });
    expect(state[0].error).toBeUndefined();
    state = cardsReducer(state, { type: 'set_option', id: c.id, patch: { size: 'L', zone: 'top' } });
    expect(state[0]).toMatchObject({ size: 'L', zone: 'top' });
    state = cardsReducer(state, { type: 'select_variant', id: c.id, variantId: 'v3' });
    expect(state[0].selectedVariantId).toBe('v3');
    expect(cardsReducer(state, { type: 'remove', id: c.id })).toEqual([]);
  });
  it('exposes size multipliers', () => {
    expect(SIZE_SCALE).toEqual({ S: 0.85, M: 1, L: 1.15 });
  });
});
