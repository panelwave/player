import { HttpEntitlementAdapter } from './http-entitlement.adapter';
import type { PanelWaveManifest } from '../types/manifest.types';

const manifest = (): PanelWaveManifest =>
  ({
    meta: { id: 'work-1' },
    chapters: [{ id: 'c1', panels: { p1: {}, p2: {}, p3: {} } }],
    paywall: {
      rules: [
        {
          id: 'gate',
          scope: 'work',
          entitlementType: 'purchase',
          requiredProductIds: ['book-1'],
          previewPanelCount: 1,
        },
      ],
    },
  }) as unknown as PanelWaveManifest;

/** A fetch stub that records calls and answers with a canned body. */
function stubFetch(body: unknown, ok = true) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok,
      json: () => Promise.resolve(body),
    } as Response);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const snapshotBody = (over: Record<string, unknown> = {}) => ({
  ok: true,
  data: {
    subscriptionTier: null,
    purchasedProductIds: [],
    ageVerified: false,
    ...over,
  },
});

describe('HttpEntitlementAdapter', () => {
  it('opens everything when the work has no paywall rules', async () => {
    const { impl } = stubFetch(snapshotBody());
    const adapter = new HttpEntitlementAdapter({ endpoint: '/e/{workId}', fetchImpl: impl });
    adapter.setManifest({ meta: { id: 'w' }, chapters: [] } as unknown as PanelWaveManifest);

    const status = await adapter.resolveEntitlement({ workId: 'w', panelId: 'p1' });
    expect(status.ok).toBe(true);
  });

  it('substitutes the work id into the endpoint', async () => {
    const { impl, calls } = stubFetch(snapshotBody());
    const adapter = new HttpEntitlementAdapter({ endpoint: '/api/{workId}/ent', fetchImpl: impl });
    adapter.setManifest(manifest());

    await adapter.resolveEntitlement({ workId: 'work-1', panelId: 'p1' });
    expect(calls[0].url).toBe('/api/work-1/ent');
  });

  it('sends the reader token as a bearer header', async () => {
    const { impl, calls } = stubFetch(snapshotBody());
    const adapter = new HttpEntitlementAdapter({
      endpoint: '/e/{workId}',
      readerToken: 'tok-123',
      fetchImpl: impl,
    });
    adapter.setManifest(manifest());

    await adapter.resolveEntitlement({ workId: 'work-1', panelId: 'p1' });
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok-123');
  });

  it('gates a panel the anonymous reader has not bought', async () => {
    const { impl } = stubFetch(snapshotBody());
    const adapter = new HttpEntitlementAdapter({ endpoint: '/e/{workId}', fetchImpl: impl });
    adapter.setManifest(manifest());

    expect((await adapter.resolveEntitlement({ workId: 'work-1', panelId: 'p1' })).ok).toBe(true);
    const gated = await adapter.resolveEntitlement({ workId: 'work-1', panelId: 'p2' });
    expect(gated.ok).toBe(false);
    expect(gated.reason).toBe('purchase_required');
  });

  it('opens the work for a reader who owns the product', async () => {
    const { impl } = stubFetch(snapshotBody({ purchasedProductIds: ['book-1'] }));
    const adapter = new HttpEntitlementAdapter({ endpoint: '/e/{workId}', fetchImpl: impl });
    adapter.setManifest(manifest());

    expect((await adapter.resolveEntitlement({ workId: 'work-1', panelId: 'p3' })).ok).toBe(true);
  });

  it('fetches the snapshot once and serves the rest from cache', async () => {
    const { impl, calls } = stubFetch(snapshotBody());
    const adapter = new HttpEntitlementAdapter({ endpoint: '/e/{workId}', fetchImpl: impl });
    adapter.setManifest(manifest());

    await adapter.resolveEntitlement({ workId: 'work-1', panelId: 'p1' });
    await adapter.resolveEntitlement({ workId: 'work-1', panelId: 'p2' });
    await adapter.resolveEntitlement({ workId: 'work-1', panelId: 'p3' });
    expect(calls.length).toBe(1);
  });

  it('refetches after invalidate() — the post-purchase path', async () => {
    const { impl, calls } = stubFetch(snapshotBody());
    const adapter = new HttpEntitlementAdapter({ endpoint: '/e/{workId}', fetchImpl: impl });
    adapter.setManifest(manifest());

    await adapter.resolveEntitlement({ workId: 'work-1', panelId: 'p2' });
    adapter.invalidate();
    await adapter.resolveEntitlement({ workId: 'work-1', panelId: 'p2' });
    expect(calls.length).toBe(2);
  });

  it('fails CLOSED when the backend errors', async () => {
    // A failing entitlement service must never hand out paid content.
    const { impl } = stubFetch({}, false);
    const adapter = new HttpEntitlementAdapter({ endpoint: '/e/{workId}', fetchImpl: impl });
    adapter.setManifest(manifest());

    const status = await adapter.resolveEntitlement({ workId: 'work-1', panelId: 'p3' });
    expect(status.ok).toBe(false);
    expect(adapter.getSnapshot().purchasedProductIds).toEqual([]);
  });

  it('fails CLOSED when fetch itself throws', async () => {
    const impl = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    const adapter = new HttpEntitlementAdapter({ endpoint: '/e/{workId}', fetchImpl: impl });
    adapter.setManifest(manifest());

    const status = await adapter.resolveEntitlement({ workId: 'work-1', panelId: 'p3' });
    expect(status.ok).toBe(false);
  });

  it('reports authentication from the presence of a token', () => {
    const { impl } = stubFetch(snapshotBody());
    const anon = new HttpEntitlementAdapter({ endpoint: '/e/{workId}', fetchImpl: impl });
    expect(anon.isAuthenticated()).toBe(false);

    anon.setReaderToken('tok');
    expect(anon.isAuthenticated()).toBe(true);
  });

  it('verifies age against the snapshot', async () => {
    const { impl } = stubFetch(snapshotBody({ age: 21, ageVerified: true }));
    const adapter = new HttpEntitlementAdapter({ endpoint: '/e/{workId}', fetchImpl: impl });
    adapter.setManifest(manifest());
    await adapter.resolveEntitlement({ workId: 'work-1', panelId: 'p1' });

    expect(await adapter.verifyAge(18)).toBe(true);
    expect(await adapter.verifyAge(65)).toBe(false);
  });

  it('returns the asset id unchanged when no signing endpoint is configured', async () => {
    const { impl } = stubFetch(snapshotBody());
    const adapter = new HttpEntitlementAdapter({ endpoint: '/e/{workId}', fetchImpl: impl });
    expect(await adapter.getSignedUrl('asset-1')).toBe('asset-1');
  });

  it('falls back to the raw asset id when signing fails', async () => {
    const impl = (() => Promise.reject(new Error('nope'))) as unknown as typeof fetch;
    const adapter = new HttpEntitlementAdapter({
      endpoint: '/e/{workId}',
      signedUrlEndpoint: '/sign',
      fetchImpl: impl,
    });
    // Ungated art must keep rendering when the signing service is down.
    expect(await adapter.getSignedUrl('asset-1')).toBe('asset-1');
  });
});
