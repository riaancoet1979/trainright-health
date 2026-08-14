import React from 'react';
import { it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import App from '../App';

it('provides a Health navigation tab for Garmin statistics', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(<App />);
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(container.querySelector('button[aria-label="Health"]')).not.toBeNull();
  root.unmount();
  container.remove();
});
