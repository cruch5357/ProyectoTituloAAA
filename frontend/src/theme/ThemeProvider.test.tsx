import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, ThemeSelect } from './ThemeProvider';
let dark = false;
let onChange: () => void;
beforeEach(() => {
  localStorage.clear();
  dark = false;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return dark;
      },
      addEventListener: (_: string, listener: () => void) => {
        onChange = listener;
      },
      removeEventListener: vi.fn(),
    })),
  );
});
describe('Temas visuales', () => {
  it('respeta sistema y reacciona a sus cambios', () => {
    render(
      <ThemeProvider>
        <ThemeSelect />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe('light');
    act(() => {
      dark = true;
      onChange();
    });
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
  it('persiste la preferencia explícita y permite volver a sistema', () => {
    render(
      <ThemeProvider>
        <ThemeSelect />
      </ThemeProvider>,
    );
    fireEvent.change(screen.getByLabelText('Tema visual'), {
      target: { value: 'dark' },
    });
    expect(localStorage.getItem('ui-theme')).toBe('dark');
    expect(localStorage.length).toBe(1);
    act(() => {
      dark = false;
      onChange();
    });
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.change(screen.getByLabelText('Tema visual'), {
      target: { value: 'system' },
    });
    expect(document.documentElement.dataset.theme).toBe('light');
  });
  it('recupera la preferencia guardada y tolera almacenamiento bloqueado', () => {
    localStorage.setItem('ui-theme', 'light');
    dark = true;
    const { unmount } = render(
      <ThemeProvider>
        <ThemeSelect />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe('light');
    unmount();
    const read = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    const write = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    render(
      <ThemeProvider>
        <ThemeSelect />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe('dark');
    read.mockRestore();
    write.mockRestore();
  });
});
