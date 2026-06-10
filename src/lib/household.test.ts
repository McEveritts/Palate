import { describe, it, expect } from 'vitest';
import { generateInviteCode } from './household';

describe('generateInviteCode', () => {
  it('should return an 8-character string', () => {
    const code = generateInviteCode();
    expect(typeof code).toBe('string');
    expect(code.length).toBe(8);
  });

  it('should only contain uppercase hex characters', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[0-9A-F]{8}$/);
  });

  it('should generate unique codes on consecutive calls', () => {
    const code1 = generateInviteCode();
    const code2 = generateInviteCode();
    expect(code1).not.toBe(code2);
  });
});
