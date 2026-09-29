import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, ThemeSelect, ThemeToggle } from './ThemeProvider';
import userEvent from '@testing-library/user-event';
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
  it('el toggle refleja el sistema sin persistir hasta que se elige un tema', async () => {
    dark = true;
    const { unmount } = render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const toggle = screen.getByRole('switch', { name: 'Modo oscuro' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('ui-theme')).toBeNull();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('ui-theme')).toBe('light');
    unmount();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Sistema' }));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('ui-theme')).toBeNull();
  });
  it('se puede activar con teclado', async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const toggle = screen.getByRole('switch');
    toggle.focus();
    await userEvent.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
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
