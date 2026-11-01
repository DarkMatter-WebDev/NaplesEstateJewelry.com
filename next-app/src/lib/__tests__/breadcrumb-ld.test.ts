import { describe, expect, it } from 'vitest';
import { breadcrumbLd } from '../breadcrumb-ld';

describe('breadcrumbLd', () => {
  it('builds Home → page for English with the bare origin as Home (no trailing slash)', () => {
    const ld = breadcrumbLd('en', [{ name: 'Sell Gold', path: '/gold-services' }]);
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://naplesestatejewelry.com' },
      { '@type': 'ListItem', position: 2, name: 'Sell Gold', item: 'https://naplesestatejewelry.com/gold-services' },
    ]);
  });

  it('prefixes every item with /es for Spanish and localizes Home', () => {
    const ld = breadcrumbLd('es', [
      { name: 'Vender Oro', path: '/gold-services' },
      { name: '¿Cuánto Vale Mi Oro?', path: '/gold-services/what-is-my-gold-worth' },
    ]);
    expect(ld.itemListElement.map((i) => i.item)).toEqual([
      'https://naplesestatejewelry.com/es',
      'https://naplesestatejewelry.com/es/gold-services',
      'https://naplesestatejewelry.com/es/gold-services/what-is-my-gold-worth',
    ]);
    expect(ld.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(ld.itemListElement[0].name).toBe('Inicio');
  });

  it('refuses an empty trail and non-root-relative paths', () => {
    expect(() => breadcrumbLd('en', [])).toThrow(/at least one crumb/);
    expect(() => breadcrumbLd('en', [{ name: 'x', path: 'about' }])).toThrow(/leading slash/);
    expect(() => breadcrumbLd('en', [{ name: 'x', path: '/' }])).toThrow(/non-root/);
  });
});
