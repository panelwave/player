# PanelWave Player Library - Structure

## Directory Organization

```
projects/player/src/lib/
├── types/                      # TypeScript interfaces and types
│   ├── index.ts               # Barrel export
│   ├── manifest.types.ts      # PanelWaveManifest, Meta, Chapter
│   ├── panel.types.ts         # Panel, Layer, SpeechBubble, Hotspot
│   ├── asset.types.ts         # AssetCatalog, Variants
│   ├── graph.types.ts         # Graph, Edge, Transition
│   ├── variable.types.ts      # VariableDefinition, Mutation
│   ├── player.types.ts        # PlayerOptions, PlayerState
│   └── entitlement.types.ts   # EntitlementAdapter interface
│
├── utils/                      # Helper functions
│   ├── locale-utils.ts        # Localization helpers
│   ├── asset-utils.ts         # Asset resolution
│   ├── json-logic-utils.ts    # JSON Logic evaluation
│   └── animation-utils.ts     # Easing and animation helpers
│
├── state/                      # State management
│   ├── player-state.service.ts # Central state store
│   └── events.ts              # Event definitions
│
├── services/                   # Business logic services
│   ├── manifest.service.ts    # Load and index manifests
│   ├── locale.service.ts      # Localization service
│   ├── variable-store.service.ts # Scoped variable storage
│   ├── flow-engine.service.ts # Graph navigation
│   ├── preload.service.ts     # Asset preloading
│   ├── entitlement.adapter.ts # Entitlement interface
│   ├── tracking.service.ts    # Analytics
│   ├── storage.service.ts     # localStorage persistence
│   ├── media/
│   │   ├── image-cache.service.ts   # LRU image cache
│   │   ├── audio-engine.service.ts  # WebAudio mixer
│   │   └── video-controller.service.ts # Video playback
│   └── plugin/
│       ├── plugin-host.service.ts   # Plugin loader
│       └── plugin-sandbox.ts        # Plugin sandbox logic
│
├── components/                 # Angular components
│   ├── player-shell/          # Main <pw-player> component
│   ├── viewport/              # Panel renderer
│   │   ├── layers/           # Layer components
│   │   └── overlays/         # Hotspots, speech bubbles
│   ├── toolbar/              # Bottom toolbar
│   ├── thumbnails/           # Thumbnail strip
│   ├── toc/                  # Table of contents
│   ├── modals/               # Settings, character roster, etc.
│   └── helpers/              # Directives and utility components
│
└── styles/                     # Shared styles
    ├── tokens.css             # CSS custom properties
    └── mixins.scss            # SCSS mixins
```

## Component Hierarchy

```
PlayerShellComponent (<pw-player>)
├── TopHudComponent
├── ViewportComponent
│   ├── ImageLayerComponent
│   ├── VideoLayerComponent
│   ├── TextLayerComponent
│   ├── PluginLayerComponent
│   ├── HotspotsOverlayComponent
│   └── SpeechBubblesComponent
├── ToolbarComponent
│   └── [Sub-controls]
├── ThumbnailStripComponent
├── ToCOverlayComponent
├── SettingsModalComponent
├── [Other modals]
└── WaveFabComponent
```

## Service Dependencies

```
PlayerShellComponent
  ├── PlayerStateService
  │     ├── StorageService
  │     └── TrackingService
  ├── ManifestService
  ├── FlowEngineService
  │     ├── ManifestService
  │     └── VariableStoreService
  ├── LocaleService
  ├── PreloadService
  │     ├── ImageCacheService
  │     ├── AudioEngineService
  │     └── VideoControllerService
  └── PluginHostService
```

## Implementation Order

1. **Types** - Define all interfaces matching the schema
2. **Utils** - Implement helper functions
3. **State** - Build state management layer
4. **Services** - Implement business logic
5. **Components** - Build UI layer
6. **Integration** - Wire everything together
7. **Testing** - Add comprehensive tests

## Key Files

- `public-api.ts` - Exports for library consumers
- `player.module.ts` - Main Angular module
- `player.component.ts` - Will be renamed to player-shell.component.ts

## Next Steps

1. Create all type definitions
2. Implement utility functions
3. Build state management
4. Implement core services
5. Create UI components
