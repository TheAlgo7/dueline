import { describe, expect, it } from 'vitest';
import { inr, inrCompact, parseRupees, toInput } from '../../src/core/money';
import { hostOf, isVpa, safeUrl, upiLink } from '../../src/core/upi';

describe('money', () => {
  it('formats in Indian grouping', () => {
    expect(inr(14872000)).toBe('₹1,48,720');
    expect(inr(79950)).toBe('₹799.50');
    expect(inr(0)).toBe('₹0');
    expect(inr(null)).toBe('₹ ?');
    expect(inrCompact(1241000)).toBe('₹12.4k');
    expect(inrCompact(12000000)).toBe('₹1.2L');
  });

  it('parses what people type', () => {
    expect(parseRupees('1500')).toBe(150000);
    expect(parseRupees('₹ 1,48,720')).toBe(14872000);
    expect(parseRupees('799.5')).toBe(79950);
    expect(parseRupees('0.1')).toBe(10);
    expect(parseRupees('1.5k')).toBe(150000);
    expect(parseRupees('2L')).toBe(20000000);
    expect(parseRupees('Rs. 250')).toBe(25000);
    expect(parseRupees('')).toBeNull();
    expect(parseRupees('0')).toBeNull();
    expect(parseRupees('abc')).toBeNull();
    expect(parseRupees('12.345')).toBeNull();
  });

  it('round-trips into inputs', () => {
    expect(toInput(150000)).toBe('1500');
    expect(toInput(79950)).toBe('799.5');
    expect(toInput(79905)).toBe('799.05');
    expect(parseRupees(toInput(79905))).toBe(79905);
  });
});

describe('upi', () => {
  it('builds the standard intent', () => {
    expect(upiLink({ vpa: ' Rahul@OKAXIS ', name: 'Rahul', amount: 150000, note: 'Parking Oct' })).toBe(
      'upi://pay?pa=rahul%40okaxis&pn=Rahul&am=1500.00&cu=INR&tn=Parking%20Oct',
    );
    expect(upiLink({ vpa: 'a@ybl' })).toBe('upi://pay?pa=a%40ybl&cu=INR');
  });

  it('validates UPI IDs', () => {
    expect(isVpa('rahul@okaxis')).toBe(true);
    expect(isVpa('98xxxx1234@ybl')).toBe(true);
    expect(isVpa('rahul')).toBe(false);
    expect(isVpa('@ybl')).toBe(false);
  });

  it('only opens web links', () => {
    expect(safeUrl('claude.ai/settings/billing')).toBe('https://claude.ai/settings/billing');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('intent://x')).toBeNull();
    expect(hostOf('https://www.netflix.com/account')).toBe('netflix.com');
  });
});
