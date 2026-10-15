import { HttpErrorResponse } from '@angular/common/http';
import { UNREACHABLE, apiErrorMessage } from './api-error';

const http = (status: number, error: unknown) => new HttpErrorResponse({ status, error });

describe('apiErrorMessage', () => {
  it("uses the API's own message", () => {
    expect(
      apiErrorMessage(http(400, { success: false, message: 'Tag already exists.' }), 'X'),
    ).toBe('Tag already exists.');
  });

  it('falls back to the first listed error when there is no message', () => {
    expect(apiErrorMessage(http(400, { message: ' ', errors: ['Title is required.'] }), 'X')).toBe(
      'Title is required.',
    );
  });

  it('says the server is unreachable for a network failure', () => {
    expect(apiErrorMessage(http(0, null), 'Could not save.')).toContain("Can't reach");
  });

  it('treats a proxy/gateway failure or a bare 5xx as the server being unreachable', () => {
    expect(apiErrorMessage(http(502, ''), 'Could not save.')).toBe(UNREACHABLE);
    expect(apiErrorMessage(http(504, { message: 'x' }), 'Could not save.')).toBe(UNREACHABLE);
    expect(apiErrorMessage(http(500, 'oops'), 'Could not save.')).toBe(UNREACHABLE);
  });

  it("shows the API's own 500 message, or adds a hint to the fallback when it has none", () => {
    expect(apiErrorMessage(http(500, { message: 'Database is busy.' }), 'X')).toBe(
      'Database is busy.',
    );
    expect(apiErrorMessage(http(500, { message: '' }), 'Could not save.')).toBe(
      'Could not save. Something went wrong on the server.',
    );
  });

  it('uses the fallback otherwise', () => {
    expect(apiErrorMessage(http(404, null), 'Not found.')).toBe('Not found.');
    expect(apiErrorMessage(new Error('boom'), 'Fallback.')).toBe('Fallback.');
  });
});
