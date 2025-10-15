/**
 * Export Service
 * Generates EDL, JSON, and other export formats from PanelWave content
 */

import { Injectable } from '@angular/core';
import type {
  ExportOptions,
  ExportResult,
  ExportConfig,
  PanelTiming,
  LayerComposition,
  AudioCue,
  EDLDocument,
  EDLEvent,
  JSONExport,
  TimingCSVRow,
  LayerCSVRow,
} from '../types/export.types';
import type { Panel, Layer, Chapter } from '../types';

/**
 * Export Service
 * Handles export to various formats
 */
@Injectable({
  providedIn: 'root',
})
export class ExportService {
  private config: ExportConfig = {
    defaultFramerate: 24,
    defaultTimebase: '24',
    includeComments: true,
    prettifyJSON: true,
    csvDelimiter: ',',
  };

  /**
   * Configure export service
   */
  configure(config: Partial<ExportConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Export chapters to specified format
   */
  async exportChapters(
    chapters: Chapter[],
    options: ExportOptions
  ): Promise<ExportResult> {
    try {
      const framerate = options.framerate || this.config.defaultFramerate;
      
      // Calculate timings
      const timings = this.calculatePanelTimings(chapters, framerate);
      
      // Extract layer compositions
      const layers = options.includeLayers
        ? this.extractLayerCompositions(chapters, timings)
        : [];
      
      // Extract audio cues
      const audio = options.includeAudio
        ? this.extractAudioCues(chapters, timings)
        : [];
      
      // Generate export based on format
      let result: ExportResult;
      
      switch (options.format) {
        case 'edl':
          result = this.generateEDL(timings, layers, audio, framerate);
          break;
        case 'json':
          result = this.generateJSON(chapters, timings, layers, audio, options);
          break;
        case 'csv':
          result = this.generateCSV(timings, layers, options);
          break;
        case 'xml':
          result = this.generateXML(timings, layers, audio);
          break;
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        format: options.format,
        data: '',
        filename: '',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Calculate panel timings
   */
  calculatePanelTimings(
    chapters: Chapter[],
    framerate: number
  ): PanelTiming[] {
    const timings: PanelTiming[] = [];
    let currentTime = 0;
    let globalIndex = 0;
    
    for (const chapter of chapters) {
      const panels = Object.values(chapter.panels || {});
      
      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i];
        const duration = this.getPanelDuration(panel);
        
        const timing: PanelTiming = {
          panelId: `panel-${globalIndex}`,
          chapterId: chapter.id,
          index: globalIndex,
          startTime: currentTime,
          endTime: currentTime + duration,
          duration,
          startFrame: Math.floor(currentTime * framerate),
          endFrame: Math.floor((currentTime + duration) * framerate),
          frameCount: Math.floor(duration * framerate),
          startTimecode: this.secondsToTimecode(currentTime, framerate),
          endTimecode: this.secondsToTimecode(currentTime + duration, framerate),
        };
        
        timings.push(timing);
        currentTime += duration;
        globalIndex++;
      }
    }
    
    return timings;
  }

  /**
   * Extract layer compositions
   */
  extractLayerCompositions(
    chapters: Chapter[],
    timings: PanelTiming[]
  ): LayerComposition[] {
    const compositions: LayerComposition[] = [];
    let timingIndex = 0;
    
    for (const chapter of chapters) {
      const panels = Object.values(chapter.panels || {});
      
      for (const panel of panels) {
        if (panel.layers) {
          for (let i = 0; i < panel.layers.length; i++) {
            const layer = panel.layers[i];
            const composition = this.layerToComposition(
              layer,
              i,
              timings[timingIndex]
            );
            compositions.push(composition);
          }
        }
        timingIndex++;
      }
    }
    
    return compositions;
  }

  /**
   * Extract audio cues
   */
  extractAudioCues(
    chapters: Chapter[],
    timings: PanelTiming[]
  ): AudioCue[] {
    const cues: AudioCue[] = [];
    let timingIndex = 0;
    
    for (const chapter of chapters) {
      const panels = Object.values(chapter.panels || {});
      
      for (const panel of panels) {
        const timing = timings[timingIndex];
        
        // Extract audio from panel (assuming audio property exists)
        const panelAudio = (panel as any).audio;
        if (Array.isArray(panelAudio)) {
          for (const audioRef of panelAudio) {
            const cue: AudioCue = {
              id: `audio-${cues.length}`,
              trackName: `Panel ${timing.index} Audio`,
              assetRef: audioRef,
              startTime: timing.startTime,
              duration: timing.duration,
              endTime: timing.endTime,
              startTimecode: timing.startTimecode,
              endTimecode: timing.endTimecode,
              panelId: timing.panelId,
            };
            cues.push(cue);
          }
        }
        
        timingIndex++;
      }
    }
    
    return cues;
  }

  /**
   * Generate EDL format
   */
  generateEDL(
    timings: PanelTiming[],
    layers: LayerComposition[],
    audio: AudioCue[],
    framerate: number
  ): ExportResult {
    const edl: EDLDocument = {
      title: 'PanelWave Export',
      framerate,
      events: [],
    };
    
    // Add video events (panels)
    timings.forEach((timing, index) => {
      const event: EDLEvent = {
        eventNumber: index + 1,
        reelName: 'AX',
        trackType: 'V',
        transitionType: 'C',
        sourceIn: timing.startTimecode,
        sourceOut: timing.endTimecode,
        recordIn: timing.startTimecode,
        recordOut: timing.endTimecode,
        clipName: `Panel_${timing.index}`,
        comment: `Chapter: ${timing.chapterId}`,
      };
      edl.events.push(event);
    });
    
    // Add audio events
    audio.forEach((cue, index) => {
      const event: EDLEvent = {
        eventNumber: timings.length + index + 1,
        reelName: 'AX',
        trackType: 'A',
        transitionType: 'C',
        sourceIn: cue.startTimecode,
        sourceOut: cue.endTimecode,
        recordIn: cue.startTimecode,
        recordOut: cue.endTimecode,
        clipName: cue.trackName,
        comment: cue.assetRef,
      };
      edl.events.push(event);
    });
    
    const edlText = this.formatEDL(edl);
    
    return {
      success: true,
      format: 'edl',
      data: edlText,
      filename: 'panelwave_export.edl',
      size: edlText.length,
    };
  }

  /**
   * Generate JSON format
   */
  generateJSON(
    chapters: Chapter[],
    timings: PanelTiming[],
    layers: LayerComposition[],
    audio: AudioCue[],
    options: ExportOptions
  ): ExportResult {
    const totalDuration = timings.length > 0
      ? timings[timings.length - 1].endTime
      : 0;
    
    const jsonExport: JSONExport = {
      metadata: {
        workId: chapters[0]?.id || 'unknown',
        workTitle: 'PanelWave Export',
        exportDate: new Date().toISOString(),
        framerate: options.framerate || this.config.defaultFramerate,
        totalDuration,
      },
      timings,
      layers,
      audio,
    };
    
    if (options.includeMetadata) {
      jsonExport.panels = chapters.flatMap(ch => Object.values(ch.panels || {}));
    }
    
    const jsonText = this.config.prettifyJSON
      ? JSON.stringify(jsonExport, null, 2)
      : JSON.stringify(jsonExport);
    
    return {
      success: true,
      format: 'json',
      data: jsonExport,
      filename: 'panelwave_export.json',
      size: jsonText.length,
    };
  }

  /**
   * Generate CSV format
   */
  generateCSV(
    timings: PanelTiming[],
    layers: LayerComposition[],
    options: ExportOptions
  ): ExportResult {
    const delimiter = this.config.csvDelimiter;
    let csv = '';
    
    // Timing CSV
    if (options.includeTimings !== false) {
      csv += 'Panel Timings\n';
      csv += this.generateTimingCSV(timings, delimiter);
      csv += '\n\n';
    }
    
    // Layer CSV
    if (options.includeLayers) {
      csv += 'Layer Compositions\n';
      csv += this.generateLayerCSV(layers, delimiter);
    }
    
    return {
      success: true,
      format: 'csv',
      data: csv,
      filename: 'panelwave_export.csv',
      size: csv.length,
    };
  }

  /**
   * Generate XML format
   */
  generateXML(
    timings: PanelTiming[],
    layers: LayerComposition[],
    audio: AudioCue[]
  ): ExportResult {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<panelwave-export>\n';
    
    // Timings
    xml += '  <timings>\n';
    timings.forEach(timing => {
      xml += `    <panel id="${timing.panelId}" chapter="${timing.chapterId}">\n`;
      xml += `      <start>${timing.startTime}</start>\n`;
      xml += `      <end>${timing.endTime}</end>\n`;
      xml += `      <duration>${timing.duration}</duration>\n`;
      xml += `      <timecode start="${timing.startTimecode}" end="${timing.endTimecode}" />\n`;
      xml += '    </panel>\n';
    });
    xml += '  </timings>\n';
    
    // Layers
    xml += '  <layers>\n';
    layers.forEach(layer => {
      xml += `    <layer id="${layer.layerId}" type="${layer.layerType}">\n`;
      xml += `      <position x="${layer.x}" y="${layer.y}" />\n`;
      xml += `      <size width="${layer.width}" height="${layer.height}" />\n`;
      if (layer.opacity !== undefined) {
        xml += `      <opacity>${layer.opacity}</opacity>\n`;
      }
      xml += '    </layer>\n';
    });
    xml += '  </layers>\n';
    
    // Audio
    xml += '  <audio>\n';
    audio.forEach(cue => {
      xml += `    <cue id="${cue.id}" track="${cue.trackName}">\n`;
      xml += `      <asset>${cue.assetRef}</asset>\n`;
      xml += `      <time start="${cue.startTime}" end="${cue.endTime}" />\n`;
      xml += '    </cue>\n';
    });
    xml += '  </audio>\n';
    
    xml += '</panelwave-export>';
    
    return {
      success: true,
      format: 'xml',
      data: xml,
      filename: 'panelwave_export.xml',
      size: xml.length,
    };
  }

  /**
   * Get panel duration
   */
  private getPanelDuration(panel: Panel): number {
    // Default duration: 3 seconds
    // Can be overridden by panel.duration if it exists
    return (panel as any).duration || 3.0;
  }

  /**
   * Convert layer to composition
   */
  private layerToComposition(
    layer: Layer,
    index: number,
    timing: PanelTiming
  ): LayerComposition {
    const layerAny = layer as any;
    return {
      layerId: layer.id,
      layerType: layerAny['type'] || 'unknown',
      index,
      x: layerAny['x'] || 0,
      y: layerAny['y'] || 0,
      width: layerAny['width'] || 0,
      height: layerAny['height'] || 0,
      rotation: layerAny['rotation'],
      scaleX: layerAny['scaleX'],
      scaleY: layerAny['scaleY'],
      opacity: layer.opacity,
      blendMode: layerAny['blendMode'],
      filters: layerAny['filters'],
      assetRef: layerAny['assetRef'],
      assetType: layerAny['type'],
    };
  }

  /**
   * Convert seconds to timecode (HH:MM:SS:FF)
   */
  private secondsToTimecode(seconds: number, framerate: number): string {
    const totalFrames = Math.floor(seconds * framerate);
    const frames = totalFrames % framerate;
    const totalSeconds = Math.floor(totalFrames / framerate);
    const secs = totalSeconds % 60;
    const mins = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);
    
    return `${this.pad(hours)}:${this.pad(mins)}:${this.pad(secs)}:${this.pad(frames)}`;
  }

  /**
   * Format EDL document
   */
  private formatEDL(edl: EDLDocument): string {
    let text = `TITLE: ${edl.title}\n`;
    text += `FCM: NON-DROP FRAME\n\n`;
    
    edl.events.forEach(event => {
      text += `${this.pad(event.eventNumber, 3)}  ${event.reelName}       `;
      text += `${event.trackType}     ${event.transitionType}        `;
      text += `${event.sourceIn} ${event.sourceOut} `;
      text += `${event.recordIn} ${event.recordOut}\n`;
      
      if (event.clipName && this.config.includeComments) {
        text += `* FROM CLIP NAME: ${event.clipName}\n`;
      }
      if (event.comment && this.config.includeComments) {
        text += `* COMMENT: ${event.comment}\n`;
      }
      text += '\n';
    });
    
    return text;
  }

  /**
   * Generate timing CSV
   */
  private generateTimingCSV(timings: PanelTiming[], delimiter: string): string {
    let csv = `Panel ID${delimiter}Chapter${delimiter}Index${delimiter}`;
    csv += `Start Time${delimiter}End Time${delimiter}Duration${delimiter}`;
    csv += `Start Frame${delimiter}End Frame\n`;
    
    timings.forEach(timing => {
      csv += `${timing.panelId}${delimiter}`;
      csv += `${timing.chapterId}${delimiter}`;
      csv += `${timing.index}${delimiter}`;
      csv += `${timing.startTime}${delimiter}`;
      csv += `${timing.endTime}${delimiter}`;
      csv += `${timing.duration}${delimiter}`;
      csv += `${timing.startFrame}${delimiter}`;
      csv += `${timing.endFrame}\n`;
    });
    
    return csv;
  }

  /**
   * Generate layer CSV
   */
  private generateLayerCSV(layers: LayerComposition[], delimiter: string): string {
    let csv = `Layer ID${delimiter}Type${delimiter}Index${delimiter}`;
    csv += `X${delimiter}Y${delimiter}Width${delimiter}Height${delimiter}`;
    csv += `Opacity${delimiter}Asset Ref\n`;
    
    layers.forEach(layer => {
      csv += `${layer.layerId}${delimiter}`;
      csv += `${layer.layerType}${delimiter}`;
      csv += `${layer.index}${delimiter}`;
      csv += `${layer.x}${delimiter}`;
      csv += `${layer.y}${delimiter}`;
      csv += `${layer.width}${delimiter}`;
      csv += `${layer.height}${delimiter}`;
      csv += `${layer.opacity || 1}${delimiter}`;
      csv += `${layer.assetRef || ''}\n`;
    });
    
    return csv;
  }

  /**
   * Pad number with zeros
   */
  private pad(num: number, size: number = 2): string {
    return String(num).padStart(size, '0');
  }
}
