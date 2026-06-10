import React, { useEffect } from 'react';
import { describe, it, expect } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import {
  ToastProvider,
  useToast,
  ConfirmProvider,
  useConfirm,
} from '../components/ui';

const flush = () => new Promise<void>((r) => setTimeout(r, 50));

function mount(children: React.ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(children);
  return { container, root };
}

function unmount(container: HTMLDivElement, root: Root) {
  try { root.unmount(); } catch {}
  container.remove();
}

describe('Toast', () => {
  it('shows a toast and lets it be dismissed', async () => {
    const Caller = () => {
      const { showToast } = useToast();
      useEffect(() => {
        showToast('Hello world', { kind: 'success', duration: 0 });
      }, [showToast]);
      return null;
    };

    const { container, root } = mount(
      <ToastProvider>
        <Caller />
      </ToastProvider>,
    );
    await flush();
    expect(document.body.textContent).toContain('Hello world');

    // Click the dismiss button
    const btn = document.querySelector(
      'button[aria-label="Dismiss notification"]',
    ) as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    btn!.click();
    await flush();
    expect(document.body.textContent).not.toContain('Hello world');

    unmount(container, root);
  });
});

describe('ConfirmDialog', () => {
  it('resolves true when OK clicked and false when Cancel clicked', async () => {
    const results: boolean[] = [];

    const Caller = () => {
      const { confirm } = useConfirm();
      useEffect(() => {
        confirm('Are you sure?').then((v) => results.push(v));
      }, [confirm]);
      return null;
    };

    const { container, root } = mount(
      <ConfirmProvider>
        <Caller />
      </ConfirmProvider>,
    );
    await flush();

    expect(document.body.textContent).toContain('Are you sure?');
    const okBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'OK',
    ) as HTMLButtonElement | undefined;
    expect(okBtn).toBeDefined();
    okBtn!.click();
    await flush();
    expect(results).toEqual([true]);

    unmount(container, root);
  });

  it('confirmChoice returns the chosen value', async () => {
    const results: Array<string | null> = [];

    const Caller = () => {
      const { confirmChoice } = useConfirm();
      useEffect(() => {
        confirmChoice<string>({
          title: 'Import mode',
          message: 'How should we apply this import?',
          choices: [
            { label: 'Merge',   value: 'merge',   variant: 'primary' },
            { label: 'Replace', value: 'replace', variant: 'danger' },
            { label: 'Cancel',  value: null as unknown as string, variant: 'secondary' },
          ],
        }).then((v) => results.push(v));
      }, [confirmChoice]);
      return null;
    };

    const { container, root } = mount(
      <ConfirmProvider>
        <Caller />
      </ConfirmProvider>,
    );
    await flush();

    const replaceBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Replace',
    ) as HTMLButtonElement | undefined;
    expect(replaceBtn).toBeDefined();
    replaceBtn!.click();
    await flush();
    expect(results).toEqual(['replace']);

    unmount(container, root);
  });
});
