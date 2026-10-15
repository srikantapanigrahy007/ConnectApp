import { describe, expect, it } from 'vitest';
import { formatUptime } from './format';

describe('formatUptime', () => {
  it.each([
    [0, '0s'],
    [59.9, '59s'],
    [61, '1m 1s'],
    [3_725, '1h 2m'],
    [90_000, '1d 1h'],
  ])('formats %s seconds as %s', (input, expected) => {
    expect(formatUptime(input)).toBe(expected);
  });
});
