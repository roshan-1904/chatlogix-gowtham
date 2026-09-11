import { describe, expect, it } from 'vitest';
import { buildSchedule } from '../schedule.js';
import type { ManifestConversation } from '../config.js';
import { LANGUAGE_PROFILES, TOTAL_CONVERSATIONS, TOTAL_MESSAGES } from '../fixtures/languages.js';

function makeConversations(count: number, turnsPer = 6): ManifestConversation[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    languageKey: 'ta',
    expectedDetection: 'ta',
    expectsTranslation: true,
    customerPhone: `+9199000${String(index).padStart(3, '0')}`,
    vendorId: `vendor-${index % 10}`,
    phoneNumberId: `LOADTEST-PN-${String(index % 10).padStart(3, '0')}`,
    turns: Array.from({ length: turnsPer }, (_, t) => `turn ${t + 1}`)
  }));
}

describe('buildSchedule', () => {
  it('emits every turn of every conversation exactly once', () => {
    const schedule = buildSchedule(makeConversations(20), 1.5, 'test');
    expect(schedule).toHaveLength(120);

    const seen = new Set(schedule.map((m) => `${m.conversation.index}:${m.turnIndex}`));
    expect(seen.size).toBe(120);
  });

  it('preserves turn order within each conversation', () => {
    // The load-bearing invariant: a conversation whose turn 4 arrived before
    // turn 3 would feed the pipeline an incoherent dialogue, and every cost
    // and quality number from the run would be meaningless.
    const schedule = buildSchedule(makeConversations(50), 1.5, 'test');

    const lastSeen = new Map<number, { turnIndex: number; atMs: number }>();
    for (const message of schedule) {
      const previous = lastSeen.get(message.conversation.index);
      if (previous) {
        expect(message.turnIndex).toBe(previous.turnIndex + 1);
        expect(message.atMs).toBeGreaterThanOrEqual(previous.atMs);
      } else {
        expect(message.turnIndex).toBe(0);
      }
      lastSeen.set(message.conversation.index, { turnIndex: message.turnIndex, atMs: message.atMs });
    }
  });

  it('paces messages at the requested rate', () => {
    const rate = 2;
    const schedule = buildSchedule(makeConversations(30), rate, 'test');
    const durationSec = schedule[schedule.length - 1]!.atMs / 1000;
    // 180 messages at 2/s, minus the final interval.
    expect(durationSec).toBeCloseTo((schedule.length - 1) / rate, 1);
  });

  it('keeps inter-turn gaps far clear of the 60s lock TTL and 400ms burst window', () => {
    // At the documented Phase 1 shape, consecutive turns of one conversation
    // must not land inside the burst-merge window or while the previous turn
    // could still hold the conversation lock.
    const schedule = buildSchedule(makeConversations(TOTAL_CONVERSATIONS), 1.5, 'test');

    const lastAt = new Map<number, number>();
    let minGapMs = Number.POSITIVE_INFINITY;
    for (const message of schedule) {
      const previous = lastAt.get(message.conversation.index);
      if (previous !== undefined) minGapMs = Math.min(minGapMs, message.atMs - previous);
      lastAt.set(message.conversation.index, message.atMs);
    }

    expect(minGapMs).toBeGreaterThan(60_000);
  });

  it('generates unique whatsappMessageIds', () => {
    const schedule = buildSchedule(makeConversations(TOTAL_CONVERSATIONS), 1.5, 'abc12345');
    const ids = new Set(schedule.map((m) => m.whatsappMessageId));
    expect(ids.size).toBe(schedule.length);
    expect(schedule[0]!.whatsappMessageId).toMatch(/^wamid\.LOADTEST\.abc12345\.\d{5}$/);
  });

  it('handles the preflight shape (one conversation per language)', () => {
    const schedule = buildSchedule(makeConversations(LANGUAGE_PROFILES.length), 1.5, 'test');
    expect(schedule).toHaveLength(LANGUAGE_PROFILES.length * 6);
  });

  it('returns an empty schedule for no conversations, and rejects a zero rate', () => {
    expect(buildSchedule([], 1.5, 'test')).toEqual([]);
    expect(() => buildSchedule(makeConversations(1), 0, 'test')).toThrow(/rate/);
  });
});

describe('language fixtures', () => {
  it('matches the documented 200 conversations / 1,200 messages', () => {
    expect(TOTAL_CONVERSATIONS).toBe(200);
    expect(TOTAL_MESSAGES).toBe(1200);
  });

  it('marks exactly the two Latin-script profiles as needing no translation', () => {
    // These are the control groups. Hinglish/Tanglish is Tamil or Hindi
    // *language* in Latin *script*: detectLanguageFromText returns 'en' and
    // needsEnglish returns false, so it skips every translation call and
    // should cost about what English costs.
    const latin = LANGUAGE_PROFILES.filter((p) => !p.expectsTranslation).map((p) => p.key);
    expect(latin.sort()).toEqual(['en', 'latin_mixed']);
  });

  it('expects Marathi to be detected as Hindi', () => {
    // Devanagari is tested first in detectLanguageFromText, so Marathi shares
    // the 'hi' bucket. Documented behaviour, not a bug.
    const marathi = LANGUAGE_PROFILES.find((p) => p.key === 'mr');
    expect(marathi?.expectedDetection).toBe('hi');
  });
});
