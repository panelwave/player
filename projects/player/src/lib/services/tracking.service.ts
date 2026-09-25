/**
 * Tracking Service
 * Manages analytics event tracking with consent, batching, and debouncing
 */

import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Tracking event
 */
export interface TrackingEvent {
  type: string;
  timestamp: number;
  data?: Record<string, unknown>;
  sessionId?: string;
}

/**
 * Tracking configuration
 */
export interface TrackingConfig {
  endpoint?: string;
  consentRequired: boolean;
  eventWhitelist?: string[];
  batchSize?: number;
  batchInterval?: number;
  debounceMs?: number;
}

/**
 * Tracking Service
 * Handles analytics events with privacy-conscious features
 */
@Injectable({
  providedIn: 'root',
})
export class TrackingService {
  /**
   * Session ID (anonymized)
   */
  private sessionId: string;

  /**
   * User consent status
   */
  private hasConsent = false;

  /**
   * Configuration
   */
  private config: TrackingConfig = {
    consentRequired: true,
    batchSize: 10,
    batchInterval: 5000, // 5 seconds
    debounceMs: 300,
  };

  /**
   * Event queue
   */
  private eventQueue: TrackingEvent[] = [];

  /**
   * Event subject
   */
  private eventSubject = new Subject<TrackingEvent>();

  /**
   * Batch trigger subject
   */
  private batchTrigger = new Subject<void>();

  /**
   * Event whitelist (from manifest)
   */
  private eventWhitelist?: Set<string>;

  /**
   * Debounce timers
   */
  private debounceTimers = new Map<string, number>();

  constructor() {
    this.sessionId = this.generateSessionId();
    this.setupBatching();
  }

  /**
   * Configure tracking
   */
  configure(config: Partial<TrackingConfig>): void {
    this.config = { ...this.config, ...config };

    // Update whitelist
    if (config.eventWhitelist) {
      this.eventWhitelist = new Set(config.eventWhitelist);
    }
  }

  /**
   * Set user consent
   */
  setConsent(consent: boolean): void {
    this.hasConsent = consent;

    if (!consent) {
      // Clear queue if consent revoked
      this.eventQueue = [];
    }
  }

  /**
   * Get consent status
   */
  getConsent(): boolean {
    return this.hasConsent;
  }

  /**
   * Track an event
   */
  track(type: string, data?: Record<string, unknown>): void {
    // Check consent
    if (this.config.consentRequired && !this.hasConsent) {
      return;
    }

    // Check whitelist
    if (this.eventWhitelist && !this.eventWhitelist.has(type)) {
      return;
    }

    // Create event
    const event: TrackingEvent = {
      type,
      timestamp: Date.now(),
      data,
      sessionId: this.sessionId,
    };

    // Apply debouncing for certain event types
    if (this.shouldDebounce(type)) {
      this.trackDebounced(event);
    } else {
      this.addToQueue(event);
    }
  }

  /**
   * Track event with debouncing
   */
  private trackDebounced(event: TrackingEvent): void {
    const { type } = event;

    // Clear existing timer
    const existingTimer = this.debounceTimers.get(type);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = window.setTimeout(() => {
      this.addToQueue(event);
      this.debounceTimers.delete(type);
    }, this.config.debounceMs || 300);

    this.debounceTimers.set(type, timer);
  }

  /**
   * Check if event type should be debounced
   */
  private shouldDebounce(type: string): boolean {
    // Debounce high-frequency events
    const debounceTypes = ['scroll', 'mousemove', 'resize', 'progress'];
    return debounceTypes.includes(type);
  }

  /**
   * Add event to queue
   */
  private addToQueue(event: TrackingEvent): void {
    this.eventQueue.push(event);
    this.eventSubject.next(event);

    // Check if batch is full
    if (this.eventQueue.length >= (this.config.batchSize || 10)) {
      this.sendBatch();
    }
  }

  /**
   * Setup batching logic
   */
  private setupBatching(): void {
    // Batch by interval
    setInterval(() => {
      if (this.eventQueue.length > 0) {
        this.sendBatch();
      }
    }, this.config.batchInterval || 5000);
  }

  /**
   * Send batch of events
   */
  private async sendBatch(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return;
    }

    // Get events to send
    const events = [...this.eventQueue];
    this.eventQueue = [];

    // Send to endpoint if configured
    if (this.config.endpoint) {
      try {
        await this.sendToEndpoint(events);
      } catch (error) {
        console.error('Failed to send tracking events:', error);
        // Don't re-queue on failure to avoid memory buildup
      }
    }
  }

  /**
   * Send events to endpoint
   */
  private async sendToEndpoint(events: TrackingEvent[]): Promise<void> {
    if (!this.config.endpoint) {
      return;
    }

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: this.sessionId,
        events,
        timestamp: Date.now(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Tracking endpoint returned ${response.status}`);
    }
  }

  /**
   * Generate anonymized session ID
   */
  private generateSessionId(): string {
    // Use crypto.randomUUID if available
    if ('randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    // Fallback to random generation
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 15);
    const randomPart2 = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${randomPart}-${randomPart2}`;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Override the session ID so tracking shares one session with the player
   * state (PlayerStateService also mints an ID; analytics must use a single
   * one or the backend sees two half-sessions). Call before events are
   * queued; already-queued events keep their stamped ID.
   */
  setSessionId(sessionId: string): void {
    if (sessionId && sessionId.trim().length > 0) {
      this.sessionId = sessionId;
    }
  }

  /**
   * Synchronous flush for pagehide/unload, where async fetch is unreliable.
   * Uses navigator.sendBeacon with a text/plain payload — a "simple" content
   * type, so the cross-origin POST needs no CORS preflight during unload
   * (the ingest endpoint reads the raw body regardless of content type).
   * Falls back to fetch({keepalive}) where sendBeacon is unavailable.
   */
  flushSync(): void {
    if (this.eventQueue.length === 0 || !this.config.endpoint) {
      this.eventQueue = [];
      return;
    }

    const events = [...this.eventQueue];
    this.eventQueue = [];

    const body = JSON.stringify({
      sessionId: this.sessionId,
      events,
      timestamp: Date.now(),
    });

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const ok = navigator.sendBeacon(
        this.config.endpoint,
        new Blob([body], { type: 'text/plain' })
      );
      if (ok) {
        return;
      }
    }

    try {
      void fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });
    } catch {
      // Unload path — nothing sensible left to do.
    }
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.eventQueue.length;
  }

  /**
   * Flush queue immediately
   */
  async flush(): Promise<void> {
    await this.sendBatch();
  }

  /**
   * Clear all pending events
   */
  clear(): void {
    this.eventQueue = [];
    
    // Clear debounce timers
    this.debounceTimers.forEach((timer) => {
      window.clearTimeout(timer);
    });
    this.debounceTimers.clear();
  }

  /**
   * Cleanup
   */
  destroy(): void {
    // Flush remaining events
    this.flush();
    
    // Clear queue
    this.clear();
    
    // Complete subjects
    this.eventSubject.complete();
    this.batchTrigger.complete();
  }
}
