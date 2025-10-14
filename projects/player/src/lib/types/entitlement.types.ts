/**
 * Entitlement Type Definitions
 * Defines entitlement adapter interface for paywall integration
 */

/**
 * Entitlement adapter interface
 * Implement this interface to integrate with your entitlement/payment system
 */
export interface EntitlementAdapter {
  /**
   * Resolve entitlements for a given context
   * @param context - The entitlement context (work, chapter, panel)
   * @returns Promise resolving to entitlement status
   */
  resolveEntitlement(context: EntitlementContext): Promise<EntitlementStatus>;
  
  /**
   * Get a signed URL for a gated asset (optional)
   * @param assetId - The asset identifier
   * @param purpose - The purpose of the URL ('stream' or 'download')
   * @returns Promise resolving to the signed URL
   */
  getSignedUrl?(assetId: string, purpose: 'stream' | 'download'): Promise<string>;
  
  /**
   * Show paywall UI to the user (optional)
   * @param gate - The paywall gate information
   * @returns Promise that resolves when user completes or dismisses paywall
   */
  showPaywallUI?(gate: PaywallGate): Promise<void>;
  
  /**
   * Verify age for age-restricted content (optional)
   * @param minimumAge - The minimum required age
   * @returns Promise resolving to whether user meets age requirement
   */
  verifyAge?(minimumAge: number): Promise<boolean>;
  
  /**
   * Check if user is authenticated (optional)
   * @returns Whether user is currently authenticated
   */
  isAuthenticated?(): boolean;
  
  /**
   * Get current user information (optional)
   * @returns Current user information, or null if not authenticated
   */
  getCurrentUser?(): Promise<UserInfo | null>;
}

/**
 * Entitlement context for resolution
 */
export interface EntitlementContext {
  /** Work ID */
  workId: string;
  
  /** Chapter ID (optional) */
  chapterId?: string;
  
  /** Panel ID (optional) */
  panelId?: string;
  
  /** User token for authentication (optional) */
  userToken?: string;
  
  /** Additional context data (optional) */
  metadata?: Record<string, unknown>;
}

/**
 * Entitlement status result
 */
export interface EntitlementStatus {
  /** Whether user has access */
  ok: boolean;
  
  /** Dictionary of entitlement flags */
  entitlements: Record<string, boolean>;
  
  /** User information (optional) */
  user?: UserInfo;
  
  /** Reason for denial if not ok (optional) */
  reason?: string;
  
  /** Expiration timestamp for temporary access (optional) */
  expiresAt?: number;
}

/**
 * User information
 */
export interface UserInfo {
  /** User ID (hashed or pseudonymous) */
  id: string;
  
  /** Display name (optional) */
  displayName?: string;
  
  /** Email address (optional) */
  email?: string;
  
  /** Age (for age gating) (optional) */
  age?: number;
  
  /** Subscription tier (optional) */
  tier?: string;
  
  /** Purchased content IDs */
  purchased?: string[];
  
  /** Available tokens/credits */
  tokens?: number;
  
  /** Custom user properties */
  [key: string]: unknown;
}

/**
 * Paywall gate information
 */
export interface PaywallGate {
  /** Gate scope */
  scope: 'work' | 'chapter' | 'panel';
  
  /** Reference ID (chapter ID or panel ID) (optional) */
  refId?: string;
  
  /** Required entitlement type */
  requireEntitlement?: string;
  
  /** Reason for gate */
  reason: string;
  
  /** Preview information (optional) */
  preview?: PreviewInfo;
}

/**
 * Preview information for gated content
 */
export interface PreviewInfo {
  /** Number of preview panels allowed */
  previewPanels?: number;
  
  /** Preview mode */
  mode?: 'blur' | 'low-res' | 'watermark' | 'time-limited';
  
  /** Preview duration in seconds (for time-limited) (optional) */
  durationSeconds?: number;
}

/**
 * Purchase information
 */
export interface PurchaseInfo {
  /** Product ID */
  productId: string;
  
  /** Product name */
  name: string;
  
  /** Price with currency */
  price: {
    amount: number;
    currency: string;
  };
  
  /** Purchase type */
  type: 'one-time' | 'subscription' | 'token';
  
  /** Description (optional) */
  description?: string;
}

/**
 * Null entitlement adapter (always denies access)
 * Use this as a default when no adapter is provided
 */
export class NullEntitlementAdapter implements EntitlementAdapter {
  async resolveEntitlement(): Promise<EntitlementStatus> {
    return {
      ok: false,
      entitlements: {},
      reason: 'No entitlement adapter configured',
    };
  }
  
  async getSignedUrl(assetId: string): Promise<string> {
    // Return asset ID as-is (no signing)
    return assetId;
  }
  
  isAuthenticated(): boolean {
    return false;
  }
  
  async getCurrentUser(): Promise<UserInfo | null> {
    return null;
  }
}

/**
 * Mock entitlement adapter for development/testing
 * Grants all access by default
 */
export class MockEntitlementAdapter implements EntitlementAdapter {
  constructor(
    private mockUser: UserInfo = {
      id: 'mock-user',
      displayName: 'Test User',
      age: 18,
      tier: 'premium',
    }
  ) {}
  
  async resolveEntitlement(): Promise<EntitlementStatus> {
    return {
      ok: true,
      entitlements: {
        premium: true,
        purchased: true,
      },
      user: this.mockUser,
    };
  }
  
  async getSignedUrl(assetId: string): Promise<string> {
    return assetId;
  }
  
  async showPaywallUI(gate: PaywallGate): Promise<void> {
    console.log('[MockEntitlementAdapter] Paywall UI shown (mock)', gate);
    // Immediately resolve (no actual paywall)
  }
  
  async verifyAge(minimumAge: number): Promise<boolean> {
    return (this.mockUser.age ?? 0) >= minimumAge;
  }
  
  isAuthenticated(): boolean {
    return true;
  }
  
  async getCurrentUser(): Promise<UserInfo | null> {
    return this.mockUser;
  }
}

/**
 * Entitlement error
 */
export class EntitlementError extends Error {
  constructor(
    message: string,
    public code: EntitlementErrorCode,
    public context?: EntitlementContext
  ) {
    super(message);
    this.name = 'EntitlementError';
  }
}

/**
 * Entitlement error codes
 */
export type EntitlementErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'INSUFFICIENT_PRIVILEGES'
  | 'AGE_RESTRICTED'
  | 'PAYMENT_REQUIRED'
  | 'REGION_RESTRICTED'
  | 'ACCOUNT_SUSPENDED'
  | 'SERVICE_UNAVAILABLE'
  | 'UNKNOWN_ERROR';
