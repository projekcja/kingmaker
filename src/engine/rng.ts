/**
 * A small seeded PRNG (mulberry32).
 *
 * The whole game is deterministic given a seed: the cursor lives in the game
 * state as a plain number, so a save file replays exactly.
 */
export class Rng {
  state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [low, high). */
  range(low: number, high: number): number {
    return low + this.next() * (high - low);
  }

  /** Uniform integer in [low, high], inclusive. */
  int(low: number, high: number): number {
    return Math.floor(this.range(low, high + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** `count` distinct items, in random order. */
  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }

  /** Weighted choice; weights need not sum to 1. */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    const total = items.reduce((sum, item) => sum + Math.max(0, weightOf(item)), 0);
    let roll = this.next() * total;
    for (const item of items) {
      roll -= Math.max(0, weightOf(item));
      if (roll <= 0) return item;
    }
    return items[items.length - 1];
  }
}

/** Turn an arbitrary string into a usable 32-bit seed. */
export const seedFromString = (text: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
};
