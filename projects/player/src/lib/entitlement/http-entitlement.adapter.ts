/**
 * HTTP entitlement adapter — the real one.
 *
 * Until now the player shipped only `NullEntitlementAdapter` (denies
 * everything) and `MockEntitlementAdapter` (grants everything), so nothing
 * ever gated on an actual purchase. This adapter fetches the reader's
 * entitlement snapshot from a backend and evaluates the manifest's paywall
 * rules against it locally.
 *
 * Why evaluate locally rather than asking the server per panel:
 *   - the rules are already in the manifest the reader downloaded, so a
 *     round-trip per panel would tell the client something it can compute;
 *   - navigation must not stall on the network at every panel turn;
 *   - the snapshot is the only thing that needs to be authoritative, and it
 *     is fetched once and cached.
 *
 * This is NOT a security boundary. A determined reader can edit client state,
 * so anything that must not leak — full-resolution art, downloads — has to be
 * served through signed URLs the backend only issues to an entitled reader.
 * `getSignedUrl` is the hook for exactly that.
 */

import type {
  EntitlementAdapter,
  EntitlementContext,
  EntitlementStatus,
  UserInfo,
} from '../types/entitlement.types';
import type { PanelWaveManifest } from '../types/manifest.types';
import {
  ANONYMOUS_READER,
  evaluatePanelAccess,
  readingOrderFromManifest,
  rulesFromManifest,
  toEntitlementStatus,
  type EntitlementSnapshot,
  type EvaluatorRule,
} from './paywall-evaluator';

/** Wire shape of the snapshot endpoint. */
export interface EntitlementSnapshotResponse {
  ok: boolean;
  data?: {
    subscriptionTier: string | null;
    purchasedProductIds: string[];
    age?: number;
    ageVerified: boolean;
    user?: UserInfo;
  };
}

export interface HttpEntitlementAdapterConfig {
  /**
   * Endpoint returning the reader's snapshot for a work. `{workId}` is
   * substituted, e.g. `https://api.panelwave.org/public/works/{workId}/entitlement`.
   */
  endpoint: string;

  /** Bearer token for an identified reader. Omit for anonymous readers. */
  readerToken?: string;

  /** Endpoint that mints a signed URL for a gated asset (optional). */
  signedUrlEndpoint?: string;

  /** How long a fetched snapshot stays fresh. Default 5 minutes. */
  ttlMs?: number;

  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export class HttpEntitlementAdapter implements EntitlementAdapter {
  private manifest: PanelWaveManifest | null = null;
  private rules: EvaluatorRule[] = [];
  private readingOrder = new Map<string, number>();

  private snapshot: EntitlementSnapshot = ANONYMOUS_READER;
  private user: UserInfo | null = null;
  private snapshotFetchedAt = 0;
  private inFlight: Promise<void> | null = null;

  constructor(private config: HttpEntitlementAdapterConfig) {}

  /**
   * Give the adapter the manifest whose rules it should evaluate. The player
   * shell calls this once the manifest is loaded; without it every panel
   * evaluates as ungated, which is the correct failure direction for a work
   * that has no paywall at all.
   */
  setManifest(manifest: PanelWaveManifest | null): void {
    this.manifest = manifest;
    this.rules = rulesFromManifest(manifest);
    this.readingOrder = new Map(
      readingOrderFromManifest(manifest).map((panelId, index) => [panelId, index]),
    );
  }

  /** Swap the reader token (sign-in / sign-out) and drop the cached snapshot. */
  setReaderToken(token: string | undefined): void {
    this.config = { ...this.config, readerToken: token };
    this.invalidate();
  }

  /** Force the next check to refetch — call after a completed purchase. */
  invalidate(): void {
    this.snapshotFetchedAt = 0;
    this.snapshot = ANONYMOUS_READER;
    this.user = null;
  }

  /** The snapshot currently in hand (may be stale/anonymous). */
  getSnapshot(): EntitlementSnapshot {
    return this.snapshot;
  }

  async resolveEntitlement(context: EntitlementContext): Promise<EntitlementStatus> {
    await this.ensureSnapshot(context.workId);

    // No paywall on this work: everything is readable.
    if (this.rules.length === 0) {
      return { ok: true, entitlements: {}, ...(this.user ? { user: this.user } : {}) };
    }

    // A work-level check with no panel: gate only if the reader fails the
    // work rule outright. Preview panels are a per-panel concern.
    const panelId = context.panelId ?? '';
    const index = this.readingOrder.get(panelId) ?? Number.MAX_SAFE_INTEGER;

    const decision = evaluatePanelAccess(this.rules, this.snapshot, { id: panelId, index });
    const status = toEntitlementStatus(decision, this.snapshot);

    return {
      ...status,
      ...(this.user ? { user: this.user } : {}),
      ...(this.config.ttlMs !== 0
        ? { expiresAt: this.snapshotFetchedAt + (this.config.ttlMs ?? DEFAULT_TTL_MS) }
        : {}),
    };
  }

  async getSignedUrl(assetId: string, purpose: 'stream' | 'download' = 'stream'): Promise<string> {
    if (!this.config.signedUrlEndpoint) return assetId;
    try {
      const res = await this.fetchImpl()(
        `${this.config.signedUrlEndpoint}?assetId=${encodeURIComponent(assetId)}&purpose=${purpose}`,
        { headers: this.headers() },
      );
      if (!res.ok) return assetId;
      const body = (await res.json()) as { ok?: boolean; data?: { url?: string } };
      return body?.data?.url ?? assetId;
    } catch {
      // Falling back to the raw id keeps ungated art rendering when the
      // signing service is down, rather than blanking the page.
      return assetId;
    }
  }

  isAuthenticated(): boolean {
    return !!this.config.readerToken;
  }

  async getCurrentUser(): Promise<UserInfo | null> {
    return this.user;
  }

  async verifyAge(minimumAge: number): Promise<boolean> {
    return this.snapshot.ageVerified && (this.snapshot.age ?? 0) >= minimumAge;
  }

  // ── internals ────────────────────────────────────────────────────────────

  private fetchImpl(): typeof fetch {
    return this.config.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (this.config.readerToken) h['Authorization'] = `Bearer ${this.config.readerToken}`;
    return h;
  }

  /** Fetch once, share the promise, and respect the TTL. */
  private async ensureSnapshot(workId: string): Promise<void> {
    const ttl = this.config.ttlMs ?? DEFAULT_TTL_MS;
    if (this.snapshotFetchedAt && Date.now() - this.snapshotFetchedAt < ttl) return;
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.fetchSnapshot(workId).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async fetchSnapshot(workId: string): Promise<void> {
    const url = this.config.endpoint.replace('{workId}', encodeURIComponent(workId));
    try {
      const res = await this.fetchImpl()(url, { headers: this.headers() });
      if (!res.ok) {
        // Treat any backend failure as "no entitlements" rather than as
        // access: failing open would give away paid content on an outage.
        this.snapshot = ANONYMOUS_READER;
        this.user = null;
        this.snapshotFetchedAt = Date.now();
        return;
      }
      const body = (await res.json()) as EntitlementSnapshotResponse;
      const data = body?.data;
      this.snapshot = data
        ? {
            subscriptionTier: data.subscriptionTier ?? null,
            purchasedProductIds: data.purchasedProductIds ?? [],
            age: data.age,
            ageVerified: !!data.ageVerified,
          }
        : ANONYMOUS_READER;
      this.user = data?.user ?? null;
      this.snapshotFetchedAt = Date.now();
    } catch {
      this.snapshot = ANONYMOUS_READER;
      this.user = null;
      this.snapshotFetchedAt = Date.now();
    }
  }
}
