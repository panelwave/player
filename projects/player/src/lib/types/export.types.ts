/**
 * Export System Type Definitions
 * Defines interfaces for exporting PanelWave content to various formats
 */

import type { Panel, Layer } from './index';

/**
 * Export format types
 */
export type ExportFormat = 'edl' | 'json' | 'csv' | 'xml';

/**
 * Export options
 */
export interface ExportOptions {
  format: ExportFormat;
  includeTimings?: boolean;
  includeAudio?: boolean;
  includeLayers?: boolean;
  includeMetadata?: boolean;
  framerate?: number;  // Default: 24
  timebase?: string;   // Default: '24'
}

/**
 * Panel timing information
 */
export interface PanelTiming {
  panelId: string;
  chapterId: string;
  index: number;
  
  // Timecodes
  startTime: number;      // Seconds
  endTime: number;        // Seconds
  duration: number;       // Seconds
  
  // Frames (for video editing)
  startFrame: number;
  endFrame: number;
  frameCount: number;
  
  // Timecode strings (HH:MM:SS:FF)
  startTimecode: string;
  endTimecode: string;
}

/**
 * Layer composition information
 */
export interface LayerComposition {
  layerId: string;
  layerType: string;
  index: number;
  
  // Position and dimensions
  x: number;
  y: number;
  width: number;
  height: number;
  
  // Transform
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  
  // Visual properties
  opacity?: number;
  blendMode?: string;
  filters?: string[];
  
  // Asset reference
  assetRef?: string;
  assetType?: string;
  
  // Timing
  fadeIn?: number;
  fadeOut?: number;
  delay?: number;
}

/**
 * Audio cue information
 */
export interface AudioCue {
  id: string;
  trackName: string;
  assetRef: string;
  
  // Timing
  startTime: number;
  duration: number;
  endTime: number;
  
  // Timecodes
  startTimecode: string;
  endTimecode: string;
  
  // Audio properties
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  loop?: boolean;
  
  // Association
  panelId?: string;
  layerId?: string;
}

/**
 * EDL event (Edit Decision List entry)
 */
export interface EDLEvent {
  eventNumber: number;
  reelName: string;
  trackType: 'V' | 'A' | 'AA';  // Video, Audio, Audio stereo
  transitionType: 'C' | 'D' | 'W';  // Cut, Dissolve, Wipe
  
  // Source timecodes
  sourceIn: string;
  sourceOut: string;
  
  // Record timecodes
  recordIn: string;
  recordOut: string;
  
  // Optional
  clipName?: string;
  comment?: string;
}

/**
 * Complete EDL document
 */
export interface EDLDocument {
  title: string;
  framerate: number;
  events: EDLEvent[];
}

/**
 * JSON export structure
 */
export interface JSONExport {
  metadata: {
    workId: string;
    workTitle: string;
    exportDate: string;
    framerate: number;
    totalDuration: number;
  };
  
  timings: PanelTiming[];
  layers: LayerComposition[];
  audio: AudioCue[];
  
  panels?: Panel[];  // Optional full panel data
}

/**
 * CSV row for timing export
 */
export interface TimingCSVRow {
  panelId: string;
  chapterIndex: number;
  panelIndex: number;
  startTime: string;
  endTime: string;
  duration: string;
  startFrame: number;
  endFrame: number;
}

/**
 * CSV row for layer export
 */
export interface LayerCSVRow {
  panelId: string;
  layerId: string;
  layerType: string;
  layerIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  assetRef: string;
}

/**
 * Export result
 */
export interface ExportResult {
  success: boolean;
  format: ExportFormat;
  data: string | object;
  filename: string;
  size?: number;  // Bytes
  error?: string;
}

/**
 * Export configuration
 */
export interface ExportConfig {
  defaultFramerate: number;
  defaultTimebase: string;
  includeComments: boolean;
  prettifyJSON: boolean;
  csvDelimiter: string;
}
