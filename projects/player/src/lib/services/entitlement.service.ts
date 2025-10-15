/**
 * Entitlement Service
 * Manages entitlement checking, paywall gating, and access control
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type {
  EntitlementAdapter,
  EntitlementContext,
  EntitlementStatus,
  PaywallGate,
  UserInfo,
} from '../types/entitlement.types';
import { NullEntitlementAdapter } from '../types/entitlement.types';

/**
 * Entitlement Service
 * Provides entitlement and paywall functionality
 */
@Injectable({
  providedIn: 'root',
})
export class EntitlementService {
  /**
   * Current entitlement adapter
   */
  private adapter: EntitlementAdapter;

  /**
   * Current entitlement status
   */
  private entitlementStatus$ = new BehaviorSubject<EntitlementStatus | null>(null);

  /**
   * Current user
   */
  private currentUser$ = new BehaviorSubject<UserInfo | null>(null);

  /**
   * Cache of entitlement checks
   */
  private cache = new Map<string, EntitlementStatus>();

  /**
   * Cache TTL in milliseconds (5 minutes)
   */
  private readonly CACHE_TTL = 5 * 60 * 1000;

  /**
   * Initialize service with null adapter
   */
  constructor() {
    this.adapter = new NullEntitlementAdapter();
  }

  /**
   * Set the entitlement adapter
   */
  setAdapter(adapter: EntitlementAdapter): void {
    this.adapter = adapter;
    this.clearCache();
    
    // Update current user if adapter supports it
    if (this.adapter.getCurrentUser) {
      this.adapter.getCurrentUser().then(user => {
        this.currentUser$.next(user);
      });
    }
  }

  /**
   * Get the current entitlement adapter
   */
  getAdapter(): EntitlementAdapter {
    return this.adapter;
  }

  /**
   * Check entitlement for a given context
   */
  async checkEntitlement(context: EntitlementContext): Promise<EntitlementStatus> {
    // Create cache key
    const cacheKey = this.getCacheKey(context);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      // Check if expired
      if (cached.expiresAt && cached.expiresAt > Date.now()) {
        return cached;
      }
    }

    // Resolve entitlement
    const status = await this.adapter.resolveEntitlement(context);

    // Cache the result
    this.cache.set(cacheKey, status);

    // Update observable
    this.entitlementStatus$.next(status);

    // Update current user
    if (status.user) {
      this.currentUser$.next(status.user);
    }

    // Schedule cache cleanup
    if (status.expiresAt) {
      const ttl = status.expiresAt - Date.now();
      setTimeout(() => this.cache.delete(cacheKey), ttl);
    } else {
      setTimeout(() => this.cache.delete(cacheKey), this.CACHE_TTL);
    }

    return status;
  }

  /**
   * Check if user has access to a panel
   */
  async hasAccessToPanel(workId: string, chapterId: string, panelId: string): Promise<boolean> {
    const status = await this.checkEntitlement({
      workId,
      chapterId,
      panelId,
    });
    return status.ok;
  }

  /**
   * Check if user has access to a chapter
   */
  async hasAccessToChapter(workId: string, chapterId: string): Promise<boolean> {
    const status = await this.checkEntitlement({
      workId,
      chapterId,
    });
    return status.ok;
  }

  /**
   * Check if user has access to a work
   */
  async hasAccessToWork(workId: string): Promise<boolean> {
    const status = await this.checkEntitlement({
      workId,
    });
    return status.ok;
  }

  /**
   * Get signed URL for an asset
   */
  async getSignedUrl(assetId: string, purpose: 'stream' | 'download' = 'stream'): Promise<string> {
    if (this.adapter.getSignedUrl) {
      return await this.adapter.getSignedUrl(assetId, purpose);
    }
    // Return asset ID as-is if signing not supported
    return assetId;
  }

  /**
   * Show paywall UI
   */
  async showPaywall(gate: PaywallGate): Promise<void> {
    if (this.adapter.showPaywallUI) {
      await this.adapter.showPaywallUI(gate);
      // Clear cache after paywall interaction
      this.clearCache();
    } else {
      console.warn('[EntitlementService] showPaywallUI not implemented by adapter');
    }
  }

  /**
   * Verify age requirement
   */
  async verifyAge(minimumAge: number): Promise<boolean> {
    if (this.adapter.verifyAge) {
      return await this.adapter.verifyAge(minimumAge);
    }
    // If not implemented, check user age
    const user = this.currentUser$.value;
    if (user?.age !== undefined) {
      return user.age >= minimumAge;
    }
    // Default to false for age verification
    return false;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    if (this.adapter.isAuthenticated) {
      return this.adapter.isAuthenticated();
    }
    // Fall back to checking if we have a user
    return this.currentUser$.value !== null;
  }

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<UserInfo | null> {
    if (this.adapter.getCurrentUser) {
      const user = await this.adapter.getCurrentUser();
      this.currentUser$.next(user);
      return user;
    }
    return this.currentUser$.value;
  }

  /**
   * Get current user as observable
   */
  getCurrentUser$(): Observable<UserInfo | null> {
    return this.currentUser$.asObservable();
  }

  /**
   * Get current entitlement status as observable
   */
  getEntitlementStatus$(): Observable<EntitlementStatus | null> {
    return this.entitlementStatus$.asObservable();
  }

  /**
   * Clear entitlement cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Create cache key from context
   */
  private getCacheKey(context: EntitlementContext): string {
    const parts = [context.workId];
    if (context.chapterId) parts.push(context.chapterId);
    if (context.panelId) parts.push(context.panelId);
    return parts.join(':');
  }
}
