import { describe, expect, it } from 'vitest';
import { DISH_SLUGS, OUTLET_SLUGS, dishImageFor, heroImage, initialsOf, outletImageFor, slugify } from '../src/images/catalog';
import { AVAILABLE_IMAGES } from '../src/images/manifest';

/** The photos that are on disk, as the site-absolute paths the manifest uses. Vite lists them; nothing is loaded. */
const ON_DISK = new Set(Object.keys(import.meta.glob('../public/images/**/*.jpg')).map((file) => file.replace('../public', '')));

const ALL = new Set(['/images/dishes/classic-burger.jpg', '/images/outlets/marine-drive.jpg', '/images/hero.jpg']);

describe('slugify', () => {
  it('lowercases, strips accents and collapses everything else to single hyphens', () => {
    expect(slugify('Classic Burger')).toBe('classic-burger');
    expect(slugify('  Fish   Burger! ')).toBe('fish-burger');
    expect(slugify('Hulhumalé Café')).toBe('hulhumale-cafe');
    expect(slugify('***')).toBe('');
  });
});

describe('initialsOf', () => {
  it('takes the first letters of the first two words', () => {
    expect(initialsOf('Classic Burger')).toBe('CB');
    expect(initialsOf('fries')).toBe('F');
    expect(initialsOf('Iced coffee with milk')).toBe('IC');
    expect(initialsOf('')).toBe('');
  });
});

describe('dishImageFor', () => {
  it("prefers the API's own imageUrl", () => {
    expect(dishImageFor({ name: 'Classic Burger', imageUrl: 'https://cdn.example.test/b.jpg' }, ALL)).toBe('https://cdn.example.test/b.jpg');
  });
  it('maps a known dish to its bundled photo when the photo exists', () => {
    expect(dishImageFor({ name: 'Classic Burger', imageUrl: null }, ALL)).toBe('/images/dishes/classic-burger.jpg');
  });
  it('answers null for a known dish whose photo has not been generated, and for an unknown dish', () => {
    expect(dishImageFor({ name: 'Fries', imageUrl: null }, ALL)).toBeNull();
    expect(dishImageFor({ name: 'Mystery Stew', imageUrl: null }, ALL)).toBeNull();
  });
});

describe('outletImageFor and heroImage', () => {
  it('follow the same rule', () => {
    expect(outletImageFor({ name: 'Marine Drive' }, ALL)).toBe('/images/outlets/marine-drive.jpg');
    expect(outletImageFor({ name: 'Lagoon Kiosk' }, ALL)).toBeNull();
    expect(heroImage(ALL)).toBe('/images/hero.jpg');
    expect(heroImage(new Set())).toBeNull();
  });
});

describe('the shipped manifest', () => {
  it('lists only photos the catalogue can ask for, and each one is on disk', () => {
    const known = new Set([
      ...[...DISH_SLUGS].map((slug) => '/images/dishes/' + slug + '.jpg'),
      ...[...OUTLET_SLUGS].map((slug) => '/images/outlets/' + slug + '.jpg'),
      '/images/hero.jpg',
    ]);
    for (const path of AVAILABLE_IMAGES) {
      expect(known.has(path), path + ' is not a photo the catalogue knows').toBe(true);
      expect(ON_DISK.has(path), path + ' is listed but not on disk').toBe(true);
    }
  });

  it('resolves nothing from an empty manifest, so the demo renders tiles and requests nothing', () => {
    const none = new Set<string>();
    expect(dishImageFor({ name: 'Classic Burger', imageUrl: null }, none)).toBeNull();
    expect(outletImageFor({ name: 'Marine Drive' }, none)).toBeNull();
    expect(heroImage(none)).toBeNull();
  });
});
