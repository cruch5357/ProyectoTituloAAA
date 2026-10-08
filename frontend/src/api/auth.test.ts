import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '../lib/apiClient';
import { refreshSession } from './auth';

describe('refreshSession', () => {
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
