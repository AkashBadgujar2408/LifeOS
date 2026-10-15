import { safeReturnUrl } from './auth.guard';

describe('safeReturnUrl', () => {
  it('keeps in-app paths', () => {
    expect(safeReturnUrl('/goals/3')).toBe('/goals/3');
    expect(safeReturnUrl('/journal/week?x=1')).toBe('/journal/week?x=1');
  });

  it('refuses anything that could leave the app, and the login page itself', () => {
    expect(safeReturnUrl('//evil.example')).toBe('/');
    expect(safeReturnUrl('https://evil.example')).toBe('/');
    expect(safeReturnUrl('/login?returnUrl=/x')).toBe('/');
    expect(safeReturnUrl(null)).toBe('/');
    expect(safeReturnUrl('')).toBe('/');
  });
});
