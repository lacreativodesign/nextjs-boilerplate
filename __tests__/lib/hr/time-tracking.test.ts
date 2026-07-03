import {
  calculateAutomaticBreak,
  calculateDurationMinutes,
  calculateOvertimeMinutes,
  shouldRequireBreak,
} from '@/lib/hr/time-tracking';

describe('time tracking calculations', () => {
  it('calculates duration with break', () => {
    const start = new Date('2026-01-01T08:00:00.000Z');
    const end = new Date('2026-01-01T17:00:00.000Z');

    expect(calculateDurationMinutes(start, end, 30)).toBe(510);
  });

  it('enforces automatic break requirement for long sessions', () => {
    expect(shouldRequireBreak(361)).toBe(true);
    expect(calculateAutomaticBreak(361, 10)).toBe(30);
    expect(calculateAutomaticBreak(361, 45)).toBe(45);
  });

  it('calculates overtime over weekly threshold', () => {
    expect(calculateOvertimeMinutes(2400)).toBe(0);
    expect(calculateOvertimeMinutes(2520)).toBe(120);
  });
});
