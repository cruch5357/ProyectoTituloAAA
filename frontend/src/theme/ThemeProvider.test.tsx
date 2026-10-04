import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, ThemeToggle } from './ThemeProvider';
import userEvent from '@testing-library/user-event';
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true })),
  );
});
describe('Tema claro/oscuro', () => {
  it('usa el dispositivo inicialmente; persiste solo la elección explícita; nunca ofrece Sistema', async () => {
    const view = render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(screen.queryByText('Sistema')).not.toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('ui-theme')).toBeNull();
    await userEvent.click(screen.getByRole('switch'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('ui-theme')).toBe('light');
    view.unmount();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    screen.getByRole('switch').focus();
    await userEvent.keyboard(' ');
    expect(localStorage.getItem('ui-theme')).toBe('dark');
    await userEvent.keyboard('{Enter}');
    expect(localStorage.getItem('ui-theme')).toBe('light');
  });
  it('tolera almacenamiento bloqueado y actualiza theme-color usando tokens', async () => {
    const read = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw Error();
      });
    const write = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw Error();
      });
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    document.documentElement.style.setProperty('--color-background', '#101418');
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(meta.content).toBe('#101418');
    await userEvent.click(screen.getByRole('switch'));
    expect(document.documentElement.dataset.theme).toBe('light');
    read.mockRestore();
    write.mockRestore();
    meta.remove();
    document.documentElement.style.removeProperty('--color-background');
  });
});
