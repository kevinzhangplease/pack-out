import { describe, expect, it } from 'vitest';
import { precipFromWmo } from './weather';
import { daylightFor, arrivalLight, formatClock } from './daylight';

describe('precipitation from WMO codes', () => {
  it('reads clear sky as none', () => {
    expect(precipFromWmo([0, 0, 0])).toBe('none');
  });
  it('reads cloud without rain as possible', () => {
    expect(precipFromWmo([2, 3, 45])).toBe('possible');
  });
  it('reads sustained rain as rain', () => {
    expect(precipFromWmo([61, 63, 61])).toBe('rain');
  });
  it('reads rain on some days and not others as changeable', () => {
    expect(precipFromWmo([0, 61, 1, 2])).toBe('changeable');
  });
  it('reads heavy rain and thunderstorms as heavy', () => {
    expect(precipFromWmo([65])).toBe('heavy');
    expect(precipFromWmo([95])).toBe('heavy');
  });
  it('lets snow win over everything, because it changes the trip', () => {
    expect(precipFromWmo([61, 71, 95])).toBe('snow');
  });
  it('reports none for an empty forecast rather than guessing', () => {
    expect(precipFromWmo([])).toBe('none');
  });
});

describe('daylight', () => {
  it('gives a long day at the June solstice on the BC coast', () => {
    const light = daylightFor(49.3, '2026-06-21');
    expect(light!.hours).toBeGreaterThan(15.5);
    expect(light!.hours).toBeLessThan(16.5);
  });

  it('gives a short day at the December solstice', () => {
    const light = daylightFor(49.3, '2026-12-21');
    expect(light!.hours).toBeGreaterThan(7.5);
    expect(light!.hours).toBeLessThan(8.5);
  });

  it('is close to twelve hours at the equinox', () => {
    const light = daylightFor(49.3, '2026-03-21');
    expect(Math.abs(light!.hours - 12)).toBeLessThan(0.5);
  });

  it('handles polar day without returning NaN', () => {
    const light = daylightFor(80, '2026-06-21');
    expect(light!.hours).toBe(24);
  });

  it('formats a clock time', () => {
    expect(formatClock(6 * 60 + 5)).toBe('06:05');
    expect(formatClock(21 * 60)).toBe('21:00');
  });
});

describe('arrival light — will we be pitching in the dark', () => {
  it('says no on a summer afternoon', () => {
    const arrival = arrivalLight(49.3, '2026-07-10', 14, 1.5);
    expect(arrival!.setupInDark).toBe(false);
    expect(arrival!.minutesOfLightLeft).toBeGreaterThan(240);
  });

  it('says yes when a long drive lands after sunset in October', () => {
    const arrival = arrivalLight(49.3, '2026-10-20', 15, 4);
    expect(arrival!.setupInDark).toBe(true);
  });

  it('counts the ninety minutes setup actually takes', () => {
    // Leaves exactly an hour of light: not enough.
    const arrival = arrivalLight(49.3, '2026-07-10', 14, 6.1);
    expect(arrival!.minutesOfLightLeft).toBeLessThan(90);
    expect(arrival!.setupInDark).toBe(true);
  });
});
