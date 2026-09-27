import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no scrolling; the shell scrolls to the top on every route change.
window.scrollTo = (() => {}) as typeof window.scrollTo;

afterEach(() => cleanup());
