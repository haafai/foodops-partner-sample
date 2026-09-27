import { describe, expect, it } from 'vitest';
import { dishImageFor, heroImage, initialsOf, outletImageFor, slugify } from '../src/images/catalog';
import { AVAILABLE_IMAGES } from '../src/images/manifest';

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
  it('is empty until the photos are generated, so the demo renders tiles and requests nothing', () => {
    expect([...AVAILABLE_IMAGES]).toEqual([]);
    expect(dishImageFor({ name: 'Classic Burger', imageUrl: null })).toBeNull();
    expect(outletImageFor({ name: 'Marine Drive' })).toBeNull();
    expect(heroImage()).toBeNull();
  });
});
