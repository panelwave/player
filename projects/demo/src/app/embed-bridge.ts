/**
 * Embed bridge protocol — moved into the library (player 1.9, protocol v2):
 * `projects/player/src/lib/embed/`. Re-exported here so the demo keeps its
 * imports. Documented in docs/EMBED_PROTOCOL.md.
 */
export {
  EMBED_ERROR_LIMIT,
  EMBED_HISTORY_LIMIT,
  EMBED_PROTOCOL_VERSION,
  hostOriginFromSearch,
  isEmbedInboundMessage,
  manifestFingerprint,
  pickLocalized,
  sameVariableValue,
  type EmbedConfigData,
  type EmbedInboundMessage,
  type EmbedOptions,
  type EmbedOutboundMessage,
  type EmbedStateSnapshot,
} from 'player';
