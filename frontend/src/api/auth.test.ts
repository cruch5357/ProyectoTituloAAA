import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '../lib/apiClient';
import { refreshSession } from './auth';

describe('refreshSession', () => {
  it('cancela una comprobación de sesión bloqueada y permite volver a intentar', async () => {
    vi.useFakeTimers();
    const post = vi.spyOn(apiClient, 'post').mockImplementation((_path, _body, options) =>
      new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('Timeout', 'AbortError')))),
    );
    try {
      const result = refreshSession().catch((error: Error) => error.name);
      await vi.advanceTimersByTimeAsync(8000);
      expect(await result).toBe('AbortError');
      post.mockResolvedValue({ data: { accessToken: 'retry' }, error: null, meta: {} });
      await expect(refreshSession()).resolves.toMatchObject({ accessToken: 'retry' });
    } finally {
      post.mockRestore();
      vi.useRealTimers();
    }
  });
  it('comparte la rotación concurrente y permite otra después de completarla', async () => {
    const result = { accessToken: 'test', user: { id: 'u1', name: 'QA', email: 'qa@example.com', role: 'COACH' as const, isActive: true, coachId: null, createdAt: '' } };
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: result, error: null, meta: {} });
    const first = refreshSession();
    const second = refreshSession();
    expect(first).toBe(second);
    await expect(first).resolves.toEqual(result);
    expect(post).toHaveBeenCalledTimes(1);
    await refreshSession();
    expect(post).toHaveBeenCalledTimes(2);
    post.mockRestore();
  });
});
