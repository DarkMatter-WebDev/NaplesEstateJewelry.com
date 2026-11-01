import { describe, expect, it } from 'vitest';
import { splitPhrase } from '../link-phrase';

describe('splitPhrase', () => {
  it('splits around the first occurrence only', () => {
    expect(splitPhrase('a b c b d', 'b')).toEqual({ before: 'a ', phrase: 'b', after: ' c b d' });
  });

  it('returns null when the phrase is absent, so the caller renders plain text', () => {
    expect(splitPhrase('coins and bars', 'sterling')).toBeNull();
  });

  it('returns null for an empty phrase rather than splitting at index 0', () => {
    expect(splitPhrase('anything', '')).toBeNull();
  });

  it('is case-sensitive — a literal match, not a search', () => {
    expect(splitPhrase('Sterling silver', 'sterling silver')).toBeNull();
  });

  it('handles the phrase at either edge of the text', () => {
    expect(splitPhrase('sterling silver flatware', 'sterling silver')).toEqual({
      before: '',
      phrase: 'sterling silver',
      after: ' flatware',
    });
    expect(splitPhrase('sell sterling silver', 'sterling silver')).toEqual({
      before: 'sell ',
      phrase: 'sterling silver',
      after: '',
    });
  });

  it('reassembles to the original text — nothing is lost or duplicated', () => {
    const text =
      'rare and pre-1965 silver coins, sterling silver flatware and hollowware, fine art, antique furniture';
    const split = splitPhrase(text, 'sterling silver flatware and hollowware');
    expect(split).not.toBeNull();
    expect(split!.before + split!.phrase + split!.after).toBe(text);
  });
});
