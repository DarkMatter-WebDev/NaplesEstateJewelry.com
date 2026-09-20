import { describe, expect, it } from 'vitest';
import {
  isNavigationComplete,
  locationKey,
  shouldArmProgressBar,
  type NavigationIntent,
} from '@/components/layout/RouteProgressBar';

const ORIGIN = 'https://naplesestatejewelry.com';

function intent(overrides: Partial<NavigationIntent> & Pick<NavigationIntent, 'href'>): NavigationIntent {
  return {
    currentOrigin: ORIGIN,
    currentPath: '/shop',
    ...overrides,
  };
}

describe('route progress bar — when it arms', () => {
  it('arms for a genuine cross-path navigation', () => {
    expect(shouldArmProgressBar(intent({ href: `${ORIGIN}/checkout` }))).toBe(true);
  });

  it('arms when only the locale prefix changes', () => {
    expect(
      shouldArmProgressBar(intent({ href: `${ORIGIN}/es/shop`, currentPath: '/shop' })),
    ).toBe(true);
  });

  // Owner change, 2026-08-17: a query-only navigation is a real wait — the shop
  // refetches from the server — so it now arms. It used to be refused on the
  // grounds that it "updates in place", which was wrong about the cost.
  it('arms for a query-only change on the same path', () => {
    // What a shop filter, sort, or pagination click looks like.
    expect(shouldArmProgressBar(intent({ href: `${ORIGIN}/shop?metal=gold&page=2` }))).toBe(true);
  });

  it('arms when the query changes from one value to another', () => {
    expect(
      shouldArmProgressBar(
        intent({ href: `${ORIGIN}/shop?page=3`, currentSearch: '?page=2' }),
      ),
    ).toBe(true);
  });

  it('arms when a query is cleared back to none', () => {
    expect(
      shouldArmProgressBar(intent({ href: `${ORIGIN}/shop`, currentSearch: '?metal=gold' })),
    ).toBe(true);
  });

  // Everything below still holds: the bar appears only when the visitor is
  // actually made to wait on the server.

  it('does not arm for a link to the exact location already shown', () => {
    expect(
      shouldArmProgressBar(intent({ href: `${ORIGIN}/shop?page=2`, currentSearch: '?page=2' })),
    ).toBe(false);
  });

  it('does not arm for a hash link on the same path and query', () => {
    expect(shouldArmProgressBar(intent({ href: `${ORIGIN}/shop#top` }))).toBe(false);
    expect(
      shouldArmProgressBar(
        intent({ href: `${ORIGIN}/shop?page=2#top`, currentSearch: '?page=2' }),
      ),
    ).toBe(false);
  });

  it('does not arm for another site', () => {
    expect(shouldArmProgressBar(intent({ href: 'https://example.com/anything' }))).toBe(false);
  });

  it('does not arm for mailto:, tel: or sms:', () => {
    expect(shouldArmProgressBar(intent({ href: 'mailto:info@naplesestatejewelry.com' }))).toBe(false);
    expect(shouldArmProgressBar(intent({ href: 'tel:+12394048505' }))).toBe(false);
    expect(shouldArmProgressBar(intent({ href: 'sms:2394048505?&body=Hi' }))).toBe(false);
  });

  it('does not arm when the link opens a new tab', () => {
    expect(shouldArmProgressBar(intent({ href: `${ORIGIN}/checkout`, target: '_blank' }))).toBe(false);
    // _self is an explicit "this tab" and must still arm.
    expect(shouldArmProgressBar(intent({ href: `${ORIGIN}/checkout`, target: '_self' }))).toBe(true);
  });

  it('does not arm for a download link', () => {
    expect(shouldArmProgressBar(intent({ href: `${ORIGIN}/invoice.pdf`, hasDownload: true }))).toBe(false);
  });

  it('does not arm for a modified click, which opens a new tab', () => {
    expect(shouldArmProgressBar(intent({ href: `${ORIGIN}/checkout`, modifiedClick: true }))).toBe(false);
  });

  it('does not throw on an unparseable href', () => {
    expect(shouldArmProgressBar(intent({ href: 'http://[' }))).toBe(false);
  });
});

describe('route progress bar — location keys', () => {
  it('spells an absent query the same way whatever the source', () => {
    // `URL.search` gives '' or '?a=1'; `URLSearchParams.toString()` gives ''
    // or 'a=1'. Both feed this, so both must land on one spelling or a
    // navigation would look incomplete forever.
    expect(locationKey('/shop', '')).toBe('/shop');
    expect(locationKey('/shop', '?')).toBe('/shop');
    expect(locationKey('/shop', '?page=2')).toBe('/shop?page=2');
    expect(locationKey('/shop', 'page=2')).toBe('/shop?page=2');
  });

  it('distinguishes two queries on one path', () => {
    expect(locationKey('/shop', 'page=2')).not.toBe(locationKey('/shop', 'page=3'));
  });
});

describe('route progress bar — when it clears', () => {
  it('completes once a different path commits', () => {
    expect(isNavigationComplete('/shop', '/shop/some-bracelet-21')).toBe(true);
  });

  it('does not complete while the committed location is unchanged', () => {
    expect(isNavigationComplete('/shop', '/shop')).toBe(false);
  });

  // The reason completion is keyed on path AND query. A shop filter never
  // changes the path, so a path-only comparison would report "not arrived"
  // forever and strand the bar until the 8s safety timeout.
  it('completes when only the query changed', () => {
    expect(
      isNavigationComplete(locationKey('/shop', ''), locationKey('/shop', 'metal=gold')),
    ).toBe(true);
  });

  // Regression: this exact mistake shipped once and was caught by measuring a
  // real back-navigation, which left the bar on screen for the full 8s safety
  // timeout. `popstate` fires AFTER the URL has moved, so recording
  // `location.pathname` as the origin records the DESTINATION. The comparison
  // then never becomes true.
  it('never completes if the destination was recorded as the origin (the popstate trap)', () => {
    const destination = '/shop';
    expect(isNavigationComplete(destination, destination)).toBe(false);
  });
});
