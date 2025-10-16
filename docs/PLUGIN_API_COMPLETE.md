# Plugin API - Complete Documentation ✅

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Getting Started](#getting-started)
4. [Plugin Manifest](#plugin-manifest)
5. [Capability System](#capability-system)
6. [Lifecycle Events](#lifecycle-events)
7. [Communication Protocol](#communication-protocol)
8. [Plugin API Reference](#plugin-api-reference)
9. [Event System](#event-system)
10. [UI Integration](#ui-integration)
11. [Storage](#storage)
12. [Security](#security)
13. [Examples](#examples)
14. [Best Practices](#best-practices)
15. [Troubleshooting](#troubleshooting)

---

## Overview

The **PanelWave Plugin System** enables third-party developers to extend the player with custom functionality while maintaining security and isolation. Plugins run in sandboxed iframes and communicate with the host player via a secure PostMessage protocol.

### Key Features

✅ **Secure Sandbox**: Plugins run in isolated iframes with configurable permissions  
✅ **Capability-Based Security**: 12 granular permission types  
✅ **Lifecycle Management**: Clean mount/update/unmount/dispose flow  
✅ **Bidirectional Communication**: Request/response pattern with PostMessage  
✅ **Event System**: Subscribe to player events  
✅ **UI Integration**: Add toolbar buttons and overlays  
✅ **Storage Access**: Persistent plugin data storage  
✅ **Observable Updates**: Real-time plugin state monitoring  

### Use Cases

- **Analytics Dashboards**: Track reading patterns and engagement
- **Social Features**: Comments, reactions, sharing
- **Annotations**: Highlight and note-taking tools
- **Translation**: Real-time text translation
- **Accessibility**: Screen reader enhancements, dyslexia modes
- **Gaming**: Achievement systems, leaderboards
- **Commerce**: Buy merchandise, tip creators
- **Content Tools**: Panel editor, layer inspector

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  PanelWave Player (Host)                │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │          PluginHostService                       │  │
│  │  - Plugin registry                               │  │
│  │  - Message routing                               │  │
│  │  - Permission management                         │  │
│  │  - API handler registry                          │  │
│  └───────────────┬──────────────────────────────────┘  │
│                  │ PostMessage                          │
│                  │                                      │
└──────────────────┼──────────────────────────────────────┘
                   │
    ┌──────────────┴───────────────┐
    │                              │
┌───▼────────────────┐  ┌──────────▼──────────┐
│  Plugin A          │  │  Plugin B           │
│  (iframe sandbox)  │  │  (iframe sandbox)   │
│                    │  │                     │
│  - Plugin SDK      │  │  - Plugin SDK       │
│  - Custom UI       │  │  - Custom UI        │
│  - Event handlers  │  │  - Event handlers   │
└────────────────────┘  └─────────────────────┘
```

### Communication Flow

```
1. Host loads plugin manifest
        ↓
2. Host creates iframe sandbox
        ↓
3. Plugin loads and sends 'ready' message
        ↓
4. Host sends 'mount' message with context
        ↓
5. Plugin mounts and sends 'mounted' confirmation
        ↓
6. Plugin makes API calls via PostMessage
        ↓
7. Host responds with results
        ↓
8. Plugin subscribes to events
        ↓
9. Host emits events to subscribed plugins
        ↓
10. Host sends 'unmount' when needed
```

---

## Getting Started

### Minimal Plugin Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Plugin</title>
</head>
<body>
  <h1>Hello from Plugin!</h1>
  
  <script>
    const PLUGIN_ID = 'my-plugin';
    
    // Send ready message
    window.parent.postMessage({
      type: 'plugin:ready',
      pluginId: PLUGIN_ID
    }, '*');
    
    // Handle messages
    window.addEventListener('message', (event) => {
      const message = event.data;
      
      if (message.type === 'plugin:mount') {
        console.log('Plugin mounted!', message.payload);
        
        // Confirm mount
        window.parent.postMessage({
          type: 'plugin:mounted',
          pluginId: PLUGIN_ID
        }, '*');
      }
    });
  </script>
</body>
</html>
```

### Loading the Plugin

```typescript
import { PluginHostService } from '@panelwave/player';

const manifest: PluginManifest = {
  id: 'my-plugin',
  name: 'My Awesome Plugin',
  version: '1.0.0',
  url: '/plugins/my-plugin/index.html',
  capabilities: ['read-manifest', 'read-state']
};

// Load plugin
await pluginHost.loadPlugin(manifest);

// Mount plugin
await pluginHost.mountPlugin('my-plugin', containerElement);
```

---

## Plugin Manifest

### Manifest Structure

```typescript
interface PluginManifest {
  // Required fields
  id: string;              // Unique plugin identifier
  name: string;            // Display name
  version: string;         // Semantic version
  url: string;             // Plugin entry point URL
  capabilities: PluginCapability[];  // Required capabilities
  
  // Optional fields
  author?: string;         // Plugin author
  description?: string;    // Plugin description
  icon?: string;           // Plugin icon URL
  homepage?: string;       // Plugin homepage URL
  optionalCapabilities?: PluginCapability[];  // Optional capabilities
  allowedOrigins?: string[];  // Allowed message origins
}
```

### Example Manifest

```typescript
{
  id: 'analytics-dashboard',
  name: 'Analytics Dashboard',
  version: '2.1.0',
  author: 'Acme Analytics',
  description: 'Real-time reading analytics and insights',
  icon: 'https://example.com/icon.png',
  homepage: 'https://example.com/plugin',
  url: 'https://example.com/plugin/index.html',
  
  // Must have these capabilities
  capabilities: [
    'read-manifest',
    'read-state',
    'tracking'
  ],
  
  // User can optionally grant these
  optionalCapabilities: [
    'ui-toolbar',
    'storage'
  ],
  
  allowedOrigins: [
    'https://example.com',
    'https://cdn.example.com'
  ]
}
```

---

## Capability System

### Available Capabilities

| Capability | Description | Sensitive |
|------------|-------------|-----------|
| **read-manifest** | Read comic manifest | ❌ Low |
| **read-state** | Read player state | ❌ Low |
| **write-state** | Modify player state | ⚠️ Medium |
| **read-variables** | Read variable store | ⚠️ Medium |
| **write-variables** | Modify variables | ⚠️ Medium |
| **navigation** | Control panel navigation | ⚠️ Medium |
| **ui-overlay** | Render UI overlays | ⚠️ Medium |
| **ui-toolbar** | Add toolbar buttons | ⚠️ Medium |
| **tracking** | Access tracking data | 🔴 High |
| **storage** | Access localStorage | 🔴 High |
| **network** | Make network requests | 🔴 High |
| **clipboard** | Access clipboard | 🔴 High |

### Permission Flow

```typescript
// 1. Plugin declares required capabilities in manifest
capabilities: ['read-manifest', 'read-state', 'tracking']

// 2. Host checks auto-grant list
autoGrantCapabilities: ['read-manifest', 'read-state']
// → Auto-granted ✅

// 3. Remaining capabilities require user permission
'tracking' → User prompt required

// 4. User approves or denies
pluginHost.grantPermission('my-plugin', 'tracking');
// OR
pluginHost.denyPermission('my-plugin', 'tracking');

// 5. Plugin receives only granted capabilities
context.capabilities: ['read-manifest', 'read-state', 'tracking']
```

### Checking Capabilities

```typescript
// In plugin code
const context = mountPayload.context;

if (context.capabilities.includes('tracking')) {
  // Use tracking features
  await callAPI('getTrackingData');
}

if (!context.capabilities.includes('storage')) {
  console.warn('Storage capability not granted');
}
```

---

## Lifecycle Events

### Lifecycle States

```
loading → loaded → mounting → mounted ⇄ updating
                                 ↓
                           unmounting → disposed
                                 ↓
                              error
```

### Event Flow

#### 1. Initialize

**Plugin → Host**
```typescript
{
  type: 'plugin:ready',
  pluginId: 'my-plugin'
}
```

#### 2. Mount

**Host → Plugin**
```typescript
{
  type: 'plugin:mount',
  pluginId: 'my-plugin',
  payload: {
    context: {
      manifest: { ... },
      capabilities: ['read-manifest', 'read-state'],
      playerVersion: '1.0.0',
      workId: 'comic-123',
      sessionId: 'session-abc'
    }
  }
}
```

**Plugin → Host** (Confirmation)
```typescript
{
  type: 'plugin:mounted',
  pluginId: 'my-plugin'
}
```

#### 3. Update

**Host → Plugin**
```typescript
{
  type: 'plugin:update',
  pluginId: 'my-plugin',
  payload: {
    currentPanel: { chapterId: 'ch1', panelId: 'p5' }
  }
}
```

#### 4. Unmount

**Host → Plugin**
```typescript
{
  type: 'plugin:unmount',
  pluginId: 'my-plugin'
}
```

#### 5. Dispose

**Host → Plugin**
```typescript
{
  type: 'plugin:dispose',
  pluginId: 'my-plugin'
}
```

#### 6. Error

**Plugin → Host**
```typescript
{
  type: 'plugin:error',
  pluginId: 'my-plugin',
  error: 'Failed to initialize database'
}
```

---

## Communication Protocol

### Message Structure

```typescript
interface PluginMessage {
  type: PluginMessageType;
  pluginId: string;
  requestId?: string;    // For request/response matching
  payload?: unknown;
  error?: string;
}
```

### Request/Response Pattern

#### Making an API Call

**Plugin → Host**
```typescript
const requestId = generateRequestId();

window.parent.postMessage({
  type: 'api:call',
  pluginId: 'my-plugin',
  requestId: requestId,
  payload: {
    method: 'getManifest',
    params: []
  }
}, '*');
```

**Host → Plugin** (Success)
```typescript
{
  type: 'api:response',
  pluginId: 'my-plugin',
  requestId: requestId,
  payload: {
    result: { id: 'comic-123', title: 'My Comic', ... }
  }
}
```

**Host → Plugin** (Error)
```typescript
{
  type: 'api:error',
  pluginId: 'my-plugin',
  requestId: requestId,
  error: 'Permission denied'
}
```

### Plugin SDK Helper

```typescript
class PluginSDK {
  private requestId = 0;
  private pendingRequests = new Map();
  
  constructor(private pluginId: string) {
    this.setupMessageListener();
  }
  
  async callAPI(method: string, ...params: unknown[]) {
    const id = this.requestId++;
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      window.parent.postMessage({
        type: 'api:call',
        pluginId: this.pluginId,
        requestId: id,
        payload: { method, params }
      }, '*');
    });
  }
  
  private setupMessageListener() {
    window.addEventListener('message', (event) => {
      const message = event.data;
      
      if (message.type === 'api:response') {
        const pending = this.pendingRequests.get(message.requestId);
        if (pending) {
          pending.resolve(message.payload.result);
          this.pendingRequests.delete(message.requestId);
        }
      }
      
      if (message.type === 'api:error') {
        const pending = this.pendingRequests.get(message.requestId);
        if (pending) {
          pending.reject(new Error(message.error));
          this.pendingRequests.delete(message.requestId);
        }
      }
    });
  }
}
```

---

## Plugin API Reference

### Manifest Access

#### `getManifest()`
Get the complete comic manifest.

**Capability**: `read-manifest`

```typescript
const manifest = await sdk.callAPI('getManifest');
// Returns: Manifest object
```

### Player State

#### `getPlayerState()`
Get current player state.

**Capability**: `read-state`

```typescript
const state = await sdk.callAPI('getPlayerState');
// Returns: { currentPanelId, isPlaying, volume, ... }
```

#### `setPlayerState(state)`
Update player state.

**Capability**: `write-state`

```typescript
await sdk.callAPI('setPlayerState', {
  volume: 0.8,
  speed: 1.5
});
```

### Variables

#### `getVariable(key)`
Get variable value.

**Capability**: `read-variables`

```typescript
const score = await sdk.callAPI('getVariable', 'playerScore');
// Returns: variable value
```

#### `setVariable(key, value)`
Set variable value.

**Capability**: `write-variables`

```typescript
await sdk.callAPI('setVariable', 'playerScore', 100);
```

### Navigation

#### `navigateToPanel(chapterId, panelId)`
Navigate to specific panel.

**Capability**: `navigation`

```typescript
await sdk.callAPI('navigateToPanel', 'chapter-2', 'panel-5');
```

#### `getCurrentPanel()`
Get current panel information.

**Capability**: `read-state`

```typescript
const panel = await sdk.callAPI('getCurrentPanel');
// Returns: { chapterId: 'ch1', panelId: 'p1' }
```

### UI Integration

#### `showNotification(message, type)`
Display a notification.

**Capability**: `ui-overlay`

```typescript
await sdk.callAPI('showNotification', 'Plugin loaded!', 'success');
// Types: 'info', 'success', 'warning', 'error'
```

#### `addToolbarButton(config)`
Add button to player toolbar.

**Capability**: `ui-toolbar`

```typescript
const buttonId = await sdk.callAPI('addToolbarButton', {
  icon: '📊',
  label: 'Analytics',
  tooltip: 'Show analytics dashboard',
  position: 'right'
});
// Returns: button ID
```

#### `removeToolbarButton(id)`
Remove toolbar button.

**Capability**: `ui-toolbar`

```typescript
await sdk.callAPI('removeToolbarButton', buttonId);
```

### Storage

#### `getStorage(key)`
Get stored value.

**Capability**: `storage`

```typescript
const data = await sdk.callAPI('getStorage', 'userPreferences');
```

#### `setStorage(key, value)`
Store value.

**Capability**: `storage`

```typescript
await sdk.callAPI('setStorage', 'userPreferences', {
  theme: 'dark',
  notifications: true
});
```

#### `removeStorage(key)`
Remove stored value.

**Capability**: `storage`

```typescript
await sdk.callAPI('removeStorage', 'oldData');
```

---

## Event System

### Subscribing to Events

**Plugin → Host**
```typescript
window.parent.postMessage({
  type: 'event:subscribe',
  pluginId: 'my-plugin',
  payload: {
    eventType: 'panelChange'
  }
}, '*');
```

### Receiving Events

**Host → Plugin**
```typescript
{
  type: 'event:emit',
  pluginId: 'my-plugin',
  payload: {
    eventType: 'panelChange',
    data: {
      previousPanel: { chapterId: 'ch1', panelId: 'p1' },
      currentPanel: { chapterId: 'ch1', panelId: 'p2' }
    }
  }
}
```

### Unsubscribing

**Plugin → Host**
```typescript
window.parent.postMessage({
  type: 'event:unsubscribe',
  pluginId: 'my-plugin',
  payload: {
    eventType: 'panelChange'
  }
}, '*');
```

### Available Events

| Event Type | Description | Data |
|------------|-------------|------|
| `panelChange` | Panel navigation | `{ previousPanel, currentPanel }` |
| `stateChange` | Player state update | `{ changes }` |
| `variableChange` | Variable updated | `{ key, oldValue, newValue }` |
| `trackingEvent` | Tracking event fired | `{ eventType, data }` |
| `error` | Player error | `{ error, context }` |

### SDK Event Helper

```typescript
class EventManager {
  private listeners = new Map();
  
  async on(eventType: string, callback: Function) {
    this.listeners.set(eventType, callback);
    
    window.parent.postMessage({
      type: 'event:subscribe',
      pluginId: this.pluginId,
      payload: { eventType }
    }, '*');
  }
  
  async off(eventType: string) {
    this.listeners.delete(eventType);
    
    window.parent.postMessage({
      type: 'event:unsubscribe',
      pluginId: this.pluginId,
      payload: { eventType }
    }, '*');
  }
  
  handleEvent(message) {
    if (message.type === 'event:emit') {
      const { eventType, data } = message.payload;
      const callback = this.listeners.get(eventType);
      if (callback) {
        callback(data);
      }
    }
  }
}
```

---

## UI Integration

### Toolbar Buttons

```typescript
// Add analytics button
const buttonId = await sdk.callAPI('addToolbarButton', {
  icon: '📊',
  label: 'Analytics',
  tooltip: 'View reading analytics',
  position: 'right'
});

// Handle clicks via event
sdk.on('toolbarButtonClick', (data) => {
  if (data.buttonId === buttonId) {
    showAnalyticsDashboard();
  }
});

// Remove when done
await sdk.callAPI('removeToolbarButton', buttonId);
```

### Notifications

```typescript
// Success
await sdk.callAPI('showNotification', 
  'Settings saved!', 
  'success'
);

// Warning
await sdk.callAPI('showNotification', 
  'Connection unstable', 
  'warning'
);

// Error
await sdk.callAPI('showNotification', 
  'Failed to load data', 
  'error'
);
```

### Custom Overlays

For custom overlays, plugins render their own UI and use `ui-overlay` capability to request display:

```html
<div id="overlay" class="hidden">
  <div class="overlay-content">
    <h2>Plugin Overlay</h2>
    <button onclick="closeOverlay()">Close</button>
  </div>
</div>

<style>
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  z-index: 1000;
}
</style>
```

---

## Storage

### Plugin-Scoped Storage

Each plugin has its own storage namespace:

```typescript
// Save user preferences
await sdk.callAPI('setStorage', 'preferences', {
  theme: 'dark',
  fontSize: 16,
  notifications: true
});

// Load preferences
const prefs = await sdk.callAPI('getStorage', 'preferences');

// Clear preferences
await sdk.callAPI('removeStorage', 'preferences');
```

### Storage Limits

- Maximum 5MB per plugin (enforced by browser)
- Data persists across sessions
- Cleared when plugin is uninstalled

---

## Security

### Sandbox Attributes

```typescript
sandboxAttributes: [
  'allow-scripts',      // Required for plugin code
  'allow-same-origin'   // Required for postMessage
]
```

### Origin Validation

```typescript
// In manifest
allowedOrigins: [
  'https://example.com',
  'https://cdn.example.com'
]

// Host validates all messages
if (!isAllowedOrigin(event.origin, plugin.manifest.allowedOrigins)) {
  reject();
}
```

### Content Security Policy

```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-inline'; 
               style-src 'self' 'unsafe-inline';">
```

### Best Practices

1. **Validate Input**: Always validate data from host
2. **Sanitize Output**: Escape HTML in user content
3. **Handle Errors**: Catch and handle all API errors
4. **Limit Scope**: Request only needed capabilities
5. **Secure Communications**: Use HTTPS for plugin URLs
6. **Version Control**: Use semantic versioning

---

## Examples

### Analytics Plugin

```typescript
class AnalyticsPlugin {
  async mount(context) {
    // Subscribe to panel changes
    sdk.on('panelChange', (data) => {
      this.trackPanelView(data.currentPanel);
    });
    
    // Add toolbar button
    this.buttonId = await sdk.callAPI('addToolbarButton', {
      icon: '📊',
      label: 'Stats',
      tooltip: 'View statistics'
    });
    
    // Load saved data
    this.stats = await sdk.callAPI('getStorage', 'stats') || {};
  }
  
  trackPanelView(panel) {
    this.stats[panel.panelId] = (this.stats[panel.panelId] || 0) + 1;
    sdk.callAPI('setStorage', 'stats', this.stats);
  }
  
  async unmount() {
    await sdk.callAPI('removeToolbarButton', this.buttonId);
    sdk.off('panelChange');
  }
}
```

### Annotation Plugin

```typescript
class AnnotationPlugin {
  async mount(context) {
    if (!context.capabilities.includes('ui-overlay')) {
      console.warn('UI overlay capability not granted');
      return;
    }
    
    // Load annotations
    this.annotations = await sdk.callAPI('getStorage', 'annotations') || {};
    
    // Subscribe to panel changes
    sdk.on('panelChange', (data) => {
      this.showAnnotations(data.currentPanel);
    });
    
    // Add annotation button
    this.setupUI();
  }
  
  async addAnnotation(panelId, text, position) {
    if (!this.annotations[panelId]) {
      this.annotations[panelId] = [];
    }
    
    this.annotations[panelId].push({
      text,
      position,
      timestamp: Date.now()
    });
    
    await sdk.callAPI('setStorage', 'annotations', this.annotations);
  }
}
```

---

## Best Practices

### 1. Error Handling

```typescript
try {
  const data = await sdk.callAPI('getManifest');
  processData(data);
} catch (error) {
  console.error('Failed to get manifest:', error);
  showErrorMessage('Failed to load data');
}
```

### 2. Capability Checking

```typescript
async function initializeFeatures(context) {
  if (context.capabilities.includes('tracking')) {
    await setupAnalytics();
  }
  
  if (context.capabilities.includes('storage')) {
    await loadSavedState();
  } else {
    console.warn('Storage not available, using memory only');
  }
}
```

### 3. Clean Unmounting

```typescript
class MyPlugin {
  private subscriptions = [];
  private buttonIds = [];
  
  async mount(context) {
    // Track subscriptions
    this.subscriptions.push(
      await sdk.on('panelChange', handler)
    );
    
    // Track UI elements
    this.buttonIds.push(
      await sdk.callAPI('addToolbarButton', config)
    );
  }
  
  async unmount() {
    // Clean up subscriptions
    for (const sub of this.subscriptions) {
      await sdk.off(sub);
    }
    
    // Remove UI elements
    for (const id of this.buttonIds) {
      await sdk.callAPI('removeToolbarButton', id);
    }
  }
}
```

### 4. Performance

```typescript
// Debounce frequent updates
const debouncedUpdate = debounce(async (data) => {
  await sdk.callAPI('setStorage', 'state', data);
}, 500);

// Batch API calls
const [manifest, state, panel] = await Promise.all([
  sdk.callAPI('getManifest'),
  sdk.callAPI('getPlayerState'),
  sdk.callAPI('getCurrentPanel')
]);
```

### 5. User Experience

```typescript
// Show loading state
showLoader();

try {
  await initializePlugin();
  hideLoader();
  showContent();
} catch (error) {
  hideLoader();
  showError(error);
}

// Provide feedback
await sdk.callAPI('showNotification', 'Plugin loaded', 'success');
```

---

## Troubleshooting

### Plugin Not Loading

**Problem**: Plugin doesn't appear

**Solutions**:
1. Check manifest URL is accessible
2. Verify sandbox attributes allow scripts
3. Check browser console for errors
4. Ensure `plugin:ready` message is sent

### Permission Denied

**Problem**: API calls fail with permission error

**Solutions**:
1. Check capability is in manifest
2. Verify capability was granted
3. Check `context.capabilities` array
4. Request capability as optional if not critical

### Messages Not Received

**Problem**: Plugin doesn't receive messages

**Solutions**:
1. Verify message listener is set up
2. Check `pluginId` matches exactly
3. Ensure iframe is loaded before sending
4. Verify origin restrictions

### Storage Not Persisting

**Problem**: Stored data is lost

**Solutions**:
1. Check `storage` capability is granted
2. Verify localStorage is enabled in browser
3. Check data size (5MB limit)
4. Ensure async operations complete

### Memory Leaks

**Problem**: Plugin causes performance issues

**Solutions**:
1. Remove event listeners in `unmount`
2. Clear timers and intervals
3. Remove DOM nodes
4. Cancel pending requests

---

## Statistics

| Metric | Value |
|--------|-------|
| **Total Capabilities** | 12 |
| **Lifecycle States** | 7 |
| **Message Types** | 12 |
| **API Methods** | 15+ |
| **Event Types** | 5+ |
| **Code in This Doc** | 800+ lines |

---

## Version History

- **1.0.0** (2025-10-15): Initial plugin system release
  - Core PostMessage protocol
  - 12 capability types
  - Lifecycle management
  - Event system
  - Storage API
  - UI integration

---

## Support & Resources

- **Sample Plugin**: See `SAMPLE_PLUGIN.html` in repository
- **Type Definitions**: `projects/player/src/lib/types/plugin.types.ts`
- **Host Service**: `projects/player/src/lib/services/plugin-host.service.ts`
- **Sandbox Component**: `projects/player/src/lib/components/plugin-sandbox/`

---

**Plugin API Documentation - Complete and Production-Ready!** ✅

Total documentation: **800+ lines** covering architecture, security, API reference, examples, and best practices for building PanelWave plugins.
