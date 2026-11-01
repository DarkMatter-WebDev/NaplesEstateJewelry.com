import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRequestedShopReturn,
  readRequestedShopReturn,
  rememberShopReturn,
  requestShopReturn,
} from '@/lib/shop-return';

function installWindow(pathname = '/shop', search = '?page=2', scrollY = 1150) {
  const values = new Map<string, string>();
  vi.stubGlobal('window', {
    location: { pathname, search },
    scrollY,
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
}

describe('shop return state', () => {
  beforeEach(() => {
    installWindow();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores the exact filtered or paginated shop URL and scroll offset', () => {
    rememberShopReturn('item-46');

    expect(requestShopReturn('item-46', '/shop')).toBe('/shop?page=2');
    expect(readRequestedShopReturn()).toBe(1150);

    clearRequestedShopReturn();
    expect(readRequestedShopReturn()).toBeNull();
  });

  it('does not use a stale return state for another product or shop path', () => {
    rememberShopReturn('item-46');

    expect(requestShopReturn('other-item', '/shop')).toBeNull();
    expect(requestShopReturn('item-46', '/es/shop')).toBeNull();
  });
});
