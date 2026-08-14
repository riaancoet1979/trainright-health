import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import SyncSettings from '../components/SyncSettings';
import { clearDeviceToken, setDeviceToken } from '../sync/config';
import { clearOutbox } from '../sync/outbox';

const flush = () => new Promise<void>((r) => setTimeout(r, 60));

function mount(children: React.ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(children);
  return { container, root };
}

function unmount(container: HTMLDivElement, root: Root) {
  try { root.unmount(); } catch { /* ignore */ }
  container.remove();
}

/** React tracks its own value on controlled inputs, so set through the native
 *  setter and dispatch, or the change never reaches the component. */
const typeInto = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const click = (element: Element) => {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

const byLabel = (container: HTMLElement, label: string) =>
  container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);

const buttonWith = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll('button'))
    .find((b) => (b.textContent ?? '').toLowerCase().includes(text.toLowerCase()));

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  }));

describe('SyncSettings', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearOutbox();
    clearDeviceToken();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('offers pairing when unpaired', async () => {
    const { container, root } = mount(<SyncSettings />);
    await flush();
    expect(byLabel(container, 'Pairing code')).toBeTruthy();
    expect(buttonWith(container, 'pair this device')).toBeTruthy();
    unmount(container, root);
  });

  it('disables the pair button until a code is entered', async () => {
    const { container, root } = mount(<SyncSettings />);
    await flush();
    const button = buttonWith(container, 'pair this device')!;
    expect(button.hasAttribute('disabled')).toBe(true);

    typeInto(byLabel(container, 'Pairing code')!, 'secret');
    await flush();
    expect(buttonWith(container, 'pair this device')!.hasAttribute('disabled')).toBe(false);
    unmount(container, root);
  });

  it('stores the token on a successful pair', async () => {
    vi.stubGlobal('fetch', vi.fn((url: unknown) => (
      String(url).includes('/bootstrap')
        ? jsonResponse({ token: 'tok_1', deviceId: 'd1' })
        : jsonResponse({ revision: 1, hasMore: false, changes: [] })
    )));

    const { container, root } = mount(<SyncSettings />);
    await flush();
    typeInto(byLabel(container, 'Pairing code')!, 'secret');
    await flush();
    click(buttonWith(container, 'pair this device')!);
    await flush();

    expect(localStorage.getItem('trainright_sync_token')).toBe('tok_1');
    unmount(container, root);
  });

  it('shows the server message when pairing is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(
      { error: { code: 'bad_code', message: 'Bootstrap code rejected.' } }, 401,
    )));

    const { container, root } = mount(<SyncSettings />);
    await flush();
    typeInto(byLabel(container, 'Pairing code')!, 'wrong');
    await flush();
    click(buttonWith(container, 'pair this device')!);
    await flush();

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toMatch(/rejected/i);
    expect(localStorage.getItem('trainright_sync_token')).toBeNull();
    unmount(container, root);
  });

  it('shows sync status once paired', async () => {
    setDeviceToken('tok_1');
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ revision: 1, hasMore: false, changes: [] })));

    const { container, root } = mount(<SyncSettings />);
    await flush();
    expect(buttonWith(container, 'sync now')).toBeTruthy();
    expect(buttonWith(container, 'unpair')).toBeTruthy();
    expect(container.querySelector('[data-testid="sync-state"]')).toBeTruthy();
    unmount(container, root);
  });

  it('returns to the pairing form after unpairing', async () => {
    setDeviceToken('tok_1');
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ revision: 1, hasMore: false, changes: [] })));

    const { container, root } = mount(<SyncSettings />);
    await flush();
    click(buttonWith(container, 'unpair')!);
    await flush();

    expect(byLabel(container, 'Pairing code')).toBeTruthy();
    expect(localStorage.getItem('trainright_sync_token')).toBeNull();
    unmount(container, root);
  });
});
