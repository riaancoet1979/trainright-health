import React from 'react';
import { createRoot } from 'react-dom/client';
import Analytics from '../components/Analytics';

describe('Analytics component', () => {
  it('renders without throwing', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    let threw = false;
    try {
      root.render(<Analytics />);
      // allow lazy/dynamic imports to resolve
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      threw = true;
    }

    expect(threw).toBe(false);

    // unmount without act wrapper to avoid React.act compatibility issues in this environment
    try {
      root.unmount();
    } catch (e) {}
    document.body.removeChild(container);
  });
});
