import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';

describe('index.html', () => {
  it('carries its own icon, so the browser does not ask the server for one that is not there', () => {
    expect(html).toMatch(/<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,[^"]+"/);
  });
});
