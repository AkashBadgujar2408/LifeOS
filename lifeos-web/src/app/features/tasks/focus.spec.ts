import { focusedSeconds, formatClock, sessionMinutes, timeVersusEstimate } from './focus';

describe('focus timer helpers', () => {
  it('shows a clock as minutes and seconds', () => {
    expect(formatClock(1500)).toBe('25:00');
    expect(formatClock(59.9)).toBe('00:59');
    expect(formatClock(3725)).toBe('62:05');
    expect(formatClock(-3)).toBe('00:00');
  });

  it('logs whole minutes, nothing under one', () => {
    expect(sessionMinutes(45)).toBe(0);
    expect(sessionMinutes(60)).toBe(1);
    expect(sessionMinutes(24 * 60 + 40)).toBe(25);
    expect(sessionMinutes(24 * 60 + 20)).toBe(24);
    expect(sessionMinutes(11 * 3600)).toBe(600);
  });

  it('adds the running stretch to the banked time', () => {
    expect(focusedSeconds(120, null, 1_000_000)).toBe(120);
    expect(focusedSeconds(120, 1_000_000, 1_030_000)).toBe(150);
  });

  it('describes actual against the estimate', () => {
    const fmt = (m: number) => `${m}m`;
    expect(timeVersusEstimate(45, 60, fmt)).toBe('45m of 60m');
    expect(timeVersusEstimate(0, 60, fmt)).toBe('60m estimated');
    expect(timeVersusEstimate(30, null, fmt)).toBe('30m');
    expect(timeVersusEstimate(0, null, fmt)).toBeNull();
  });
});
