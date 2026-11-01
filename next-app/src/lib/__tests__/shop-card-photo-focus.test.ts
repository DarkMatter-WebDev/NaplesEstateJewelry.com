import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  claimShopCardPhotoFocus,
  getShopCardPhotoFocus,
  resetShopCardPhotoFocus,
  subscribeShopCardPhotoFocus,
} from '@/lib/shop-card-photo-focus';

beforeEach(() => {
  resetShopCardPhotoFocus();
});

describe('shop card photo focus', () => {
  it('starts with no card holding focus', () => {
    expect(getShopCardPhotoFocus()).toBeNull();
  });

  it('notifies every subscriber which card claimed focus', () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeShopCardPhotoFocus(a);
    subscribeShopCardPhotoFocus(b);

    claimShopCardPhotoFocus('card-1');

    expect(a).toHaveBeenCalledExactlyOnceWith('card-1');
    expect(b).toHaveBeenCalledExactlyOnceWith('card-1');
    expect(getShopCardPhotoFocus()).toBe('card-1');
  });

  it('does not re-notify when the same card claims again', () => {
    const listener = vi.fn();
    subscribeShopCardPhotoFocus(listener);

    claimShopCardPhotoFocus('card-1');
    claimShopCardPhotoFocus('card-1');
    claimShopCardPhotoFocus('card-1');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies again once a different card claims', () => {
    const listener = vi.fn();
    subscribeShopCardPhotoFocus(listener);

    claimShopCardPhotoFocus('card-1');
    claimShopCardPhotoFocus('card-2');
    claimShopCardPhotoFocus('card-1');

    expect(listener.mock.calls.map(([id]) => id)).toEqual(['card-1', 'card-2', 'card-1']);
    expect(getShopCardPhotoFocus()).toBe('card-1');
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeShopCardPhotoFocus(listener);

    claimShopCardPhotoFocus('card-1');
    unsubscribe();
    claimShopCardPhotoFocus('card-2');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('still notifies later subscribers when one unsubscribes mid-notification', () => {
    // A card unmounting as the grid paginates does exactly this. Iterating the
    // live Set instead of a copy would skip the neighbour that follows it.
    const order: string[] = [];
    let unsubscribeSecond = () => {};
    subscribeShopCardPhotoFocus(() => {
      order.push('first');
      unsubscribeSecond();
    });
    unsubscribeSecond = subscribeShopCardPhotoFocus(() => order.push('second'));
    subscribeShopCardPhotoFocus(() => order.push('third'));

    claimShopCardPhotoFocus('card-1');

    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('models the grid rule: exactly one card is ever off its cover', () => {
    // Each card resets itself whenever the claimer is not it — the same rule
    // ProductCard applies in its subscription.
    const photos: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (const id of Object.keys(photos)) {
      subscribeShopCardPhotoFocus((focused) => {
        if (focused !== id) photos[id] = 0;
      });
    }

    claimShopCardPhotoFocus('a');
    photos.a = 3;
    expect(photos).toEqual({ a: 3, b: 0, c: 0 });

    claimShopCardPhotoFocus('b');
    photos.b = 2;
    expect(photos).toEqual({ a: 0, b: 2, c: 0 });

    claimShopCardPhotoFocus('c');
    photos.c = 5;
    expect(photos).toEqual({ a: 0, b: 0, c: 5 });
    expect(Object.values(photos).filter((index) => index !== 0)).toHaveLength(1);
  });
});
