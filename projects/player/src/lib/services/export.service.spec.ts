/**
 * ExportService Tests
 * Comprehensive test coverage for export functionality
 */

import { TestBed } from '@angular/core/testing';
import { ExportService } from './export.service';
import type { Chapter, Panel, Layer } from '../types';
import type { ExportOptions } from '../types/export.types';

describe('ExportService', () => {
  let service: ExportService;

  const mockPanels: Record<string, Panel> = {
    'panel-1': {
      layers: [
        {
          id: 'layer-1',
          kind: 'image',
          type: 'image',
          opacity: 1,
          assetRef: 'image1.jpg',
        } as unknown as Layer,
      ],
    },
    'panel-2': {
      layers: [
        {
          id: 'layer-2',
          kind: 'text',
          type: 'text',
          opacity: 0.8,
          assetRef: 'text1.svg',
        } as unknown as Layer,
      ],
    },
  };

  const mockChapters: Chapter[] = [
    {
      id: 'chapter-1',
      panels: mockPanels,
      graph: {} as any,
    } as unknown as Chapter,
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ExportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Configuration', () => {
    it('should configure service with custom settings', () => {
      service.configure({
        defaultFramerate: 30,
        prettifyJSON: false,
      });

      const config = service['config'];
      expect(config.defaultFramerate).toBe(30);
      expect(config.prettifyJSON).toBe(false);
    });

    it('should merge configuration with defaults', () => {
      service.configure({ defaultFramerate: 25 });

      const config = service['config'];
      expect(config.defaultFramerate).toBe(25);
      expect(config.defaultTimebase).toBe('24'); // Default unchanged
    });
  });

  describe('Panel Timing Calculations', () => {
    it('should calculate panel timings correctly', () => {
      const timings = service.calculatePanelTimings(mockChapters, 24);

      expect(timings.length).toBe(2);
      expect(timings[0].panelId).toBe('panel-0');
      expect(timings[0].chapterId).toBe('chapter-1');
      expect(timings[0].startTime).toBe(0);
      expect(timings[0].duration).toBe(3); // Default duration
    });

    it('should calculate cumulative timings', () => {
      const timings = service.calculatePanelTimings(mockChapters, 24);

      expect(timings[0].startTime).toBe(0);
      expect(timings[0].endTime).toBe(3);
      expect(timings[1].startTime).toBe(3);
      expect(timings[1].endTime).toBe(6);
    });

    it('should calculate frames correctly', () => {
      const timings = service.calculatePanelTimings(mockChapters, 24);

      expect(timings[0].startFrame).toBe(0);
      expect(timings[0].endFrame).toBe(72); // 3 seconds * 24 fps
      expect(timings[0].frameCount).toBe(72);
    });

    it('should generate SMPTE timecodes', () => {
      const timings = service.calculatePanelTimings(mockChapters, 24);

      expect(timings[0].startTimecode).toBe('00:00:00:00');
      expect(timings[0].endTimecode).toBe('00:00:03:00');
    });

    it('should handle different framerates', () => {
      const timings30 = service.calculatePanelTimings(mockChapters, 30);
      const timings24 = service.calculatePanelTimings(mockChapters, 24);

      expect(timings30[0].endFrame).toBe(90); // 3 * 30
      expect(timings24[0].endFrame).toBe(72); // 3 * 24
    });

    it('should handle custom panel duration', () => {
      const customChapters: Chapter[] = [
        {
          id: 'chapter-1',
          panels: {
            'panel-1': {
              duration: 5,
              layers: [],
            } as any,
          },
          graph: {} as any,
        } as unknown as Chapter,
      ];

      const timings = service.calculatePanelTimings(customChapters, 24);

      expect(timings[0].duration).toBe(5);
      expect(timings[0].endTime).toBe(5);
      expect(timings[0].frameCount).toBe(120); // 5 * 24
    });
  });

  describe('Layer Composition Extraction', () => {
    it('should extract layer compositions', () => {
      const timings = service.calculatePanelTimings(mockChapters, 24);
      const layers = service.extractLayerCompositions(mockChapters, timings);

      expect(layers.length).toBe(2);
      expect(layers[0].layerId).toBe('layer-1');
      expect(layers[1].layerId).toBe('layer-2');
    });

    it('should include layer properties', () => {
      const timings = service.calculatePanelTimings(mockChapters, 24);
      const layers = service.extractLayerCompositions(mockChapters, timings);

      expect(layers[0].layerType).toBeDefined();
      expect(layers[0].opacity).toBe(1);
      expect(layers[1].opacity).toBe(0.8);
    });

    it('should default position and dimensions to 0', () => {
      const timings = service.calculatePanelTimings(mockChapters, 24);
      const layers = service.extractLayerCompositions(mockChapters, timings);

      expect(layers[0].x).toBe(0);
      expect(layers[0].y).toBe(0);
      expect(layers[0].width).toBe(0);
      expect(layers[0].height).toBe(0);
    });

    it('should handle panels without layers', () => {
      const emptyChapters: Chapter[] = [
        {
          id: 'chapter-1',
          panels: {
            'panel-1': {} as Panel,
          },
          graph: {} as any,
        } as unknown as Chapter,
      ];

      const timings = service.calculatePanelTimings(emptyChapters, 24);
      const layers = service.extractLayerCompositions(emptyChapters, timings);

      expect(layers.length).toBe(0);
    });
  });

  describe('Audio Cue Extraction', () => {
    it('should extract audio cues from panels', () => {
      const audioChapters: Chapter[] = [
        {
          id: 'chapter-1',
          panels: {
            'panel-1': {
              audio: ['audio1.mp3', 'audio2.mp3'],
            } as any,
          },
          graph: {} as any,
        } as unknown as Chapter,
      ];

      const timings = service.calculatePanelTimings(audioChapters, 24);
      const audio = service.extractAudioCues(audioChapters, timings);

      expect(audio.length).toBe(2);
      expect(audio[0].assetRef).toBe('audio1.mp3');
      expect(audio[1].assetRef).toBe('audio2.mp3');
    });

    it('should include timing information in audio cues', () => {
      const audioChapters: Chapter[] = [
        {
          id: 'chapter-1',
          panels: {
            'panel-1': {
              audio: ['audio1.mp3'],
            } as any,
          },
          graph: {} as any,
        } as unknown as Chapter,
      ];

      const timings = service.calculatePanelTimings(audioChapters, 24);
      const audio = service.extractAudioCues(audioChapters, timings);

      expect(audio[0].startTime).toBe(0);
      expect(audio[0].duration).toBe(3);
      expect(audio[0].endTime).toBe(3);
      expect(audio[0].startTimecode).toBe('00:00:00:00');
    });

    it('should associate audio with panel', () => {
      const audioChapters: Chapter[] = [
        {
          id: 'chapter-1',
          panels: {
            'panel-1': {
              audio: ['audio1.mp3'],
            } as any,
          },
          graph: {} as any,
        } as unknown as Chapter,
      ];

      const timings = service.calculatePanelTimings(audioChapters, 24);
      const audio = service.extractAudioCues(audioChapters, timings);

      expect(audio[0].panelId).toBe('panel-0');
    });

    it('should handle panels without audio', () => {
      const timings = service.calculatePanelTimings(mockChapters, 24);
      const audio = service.extractAudioCues(mockChapters, timings);

      expect(audio.length).toBe(0);
    });
  });

  describe('EDL Export', () => {
    it('should export to EDL format', async () => {
      const options: ExportOptions = {
        format: 'edl',
        framerate: 24,
      };

      const result = await service.exportChapters(mockChapters, options);

      expect(result.success).toBe(true);
      expect(result.format).toBe('edl');
      expect(result.filename).toBe('panelwave_export.edl');
      expect(typeof result.data).toBe('string');
    });

    it('should include title and FCM in EDL', async () => {
      const options: ExportOptions = {
        format: 'edl',
        framerate: 24,
      };

      const result = await service.exportChapters(mockChapters, options);
      const edl = result.data as string;

      expect(edl).toContain('TITLE: PanelWave Export');
      expect(edl).toContain('FCM: NON-DROP FRAME');
    });

    it('should include video events in EDL', async () => {
      const options: ExportOptions = {
        format: 'edl',
        framerate: 24,
      };

      const result = await service.exportChapters(mockChapters, options);
      const edl = result.data as string;

      expect(edl).toContain('001');
      expect(edl).toContain('002');
      expect(edl).toContain('V     C'); // Video, Cut
    });

    it('should include timecodes in EDL', async () => {
      const options: ExportOptions = {
        format: 'edl',
        framerate: 24,
      };

      const result = await service.exportChapters(mockChapters, options);
      const edl = result.data as string;

      expect(edl).toContain('00:00:00:00');
      expect(edl).toContain('00:00:03:00');
    });

    it('should include audio events when audio present', async () => {
      const audioChapters: Chapter[] = [
        {
          id: 'chapter-1',
          panels: {
            'panel-1': {
              audio: ['audio1.mp3'],
              layers: [],
            } as any,
          },
          graph: {} as any,
        } as unknown as Chapter,
      ];

      const options: ExportOptions = {
        format: 'edl',
        framerate: 24,
        includeAudio: true,
      };

      const result = await service.exportChapters(audioChapters, options);
      const edl = result.data as string;

      expect(edl).toContain('A     C'); // Audio, Cut
    });
  });

  describe('JSON Export', () => {
    it('should export to JSON format', async () => {
      const options: ExportOptions = {
        format: 'json',
        framerate: 24,
      };

      const result = await service.exportChapters(mockChapters, options);

      expect(result.success).toBe(true);
      expect(result.format).toBe('json');
      expect(result.filename).toBe('panelwave_export.json');
      expect(typeof result.data).toBe('object');
    });

    it('should include metadata in JSON', async () => {
      const options: ExportOptions = {
        format: 'json',
        framerate: 30,
      };

      const result = await service.exportChapters(mockChapters, options);
      const json = result.data as any;

      expect(json.metadata).toBeDefined();
      expect(json.metadata.framerate).toBe(30);
      expect(json.metadata.exportDate).toBeDefined();
      expect(json.metadata.totalDuration).toBe(6); // 2 panels * 3 seconds
    });

    it('should include timings in JSON', async () => {
      const options: ExportOptions = {
        format: 'json',
        framerate: 24,
        includeTimings: true,
      };

      const result = await service.exportChapters(mockChapters, options);
      const json = result.data as any;

      expect(json.timings).toBeDefined();
      expect(json.timings.length).toBe(2);
      expect(json.timings[0].panelId).toBe('panel-0');
    });

    it('should include layers when requested', async () => {
      const options: ExportOptions = {
        format: 'json',
        framerate: 24,
        includeLayers: true,
      };

      const result = await service.exportChapters(mockChapters, options);
      const json = result.data as any;

      expect(json.layers).toBeDefined();
      expect(json.layers.length).toBe(2);
    });

    it('should include audio when requested', async () => {
      const audioChapters: Chapter[] = [
        {
          id: 'chapter-1',
          panels: {
            'panel-1': {
              audio: ['audio1.mp3'],
              layers: [],
            } as any,
          },
          graph: {} as any,
        } as unknown as Chapter,
      ];

      const options: ExportOptions = {
        format: 'json',
        framerate: 24,
        includeAudio: true,
      };

      const result = await service.exportChapters(audioChapters, options);
      const json = result.data as any;

      expect(json.audio).toBeDefined();
      expect(json.audio.length).toBe(1);
    });

    it('should include full panel data when includeMetadata is true', async () => {
      const options: ExportOptions = {
        format: 'json',
        framerate: 24,
        includeMetadata: true,
      };

      const result = await service.exportChapters(mockChapters, options);
      const json = result.data as any;

      expect(json.panels).toBeDefined();
      expect(json.panels.length).toBe(2);
    });
  });

  describe('CSV Export', () => {
    it('should export to CSV format', async () => {
      const options: ExportOptions = {
        format: 'csv',
        framerate: 24,
      };

      const result = await service.exportChapters(mockChapters, options);

      expect(result.success).toBe(true);
      expect(result.format).toBe('csv');
      expect(result.filename).toBe('panelwave_export.csv');
      expect(typeof result.data).toBe('string');
    });

    it('should include timing headers in CSV', async () => {
      const options: ExportOptions = {
        format: 'csv',
        framerate: 24,
      };

      const result = await service.exportChapters(mockChapters, options);
      const csv = result.data as string;

      expect(csv).toContain('Panel Timings');
      expect(csv).toContain('Panel ID,Chapter,Index');
      expect(csv).toContain('Start Time,End Time,Duration');
    });

    it('should include timing data in CSV', async () => {
      const options: ExportOptions = {
        format: 'csv',
        framerate: 24,
      };

      const result = await service.exportChapters(mockChapters, options);
      const csv = result.data as string;

      expect(csv).toContain('panel-0,chapter-1,0');
      expect(csv).toContain('panel-1,chapter-1,1');
    });

    it('should include layer data when requested', async () => {
      const options: ExportOptions = {
        format: 'csv',
        framerate: 24,
        includeLayers: true,
      };

      const result = await service.exportChapters(mockChapters, options);
      const csv = result.data as string;

      expect(csv).toContain('Layer Compositions');
      expect(csv).toContain('Layer ID,Type,Index');
    });

    it('should use configured delimiter', async () => {
      service.configure({ csvDelimiter: ';' });

      const options: ExportOptions = {
        format: 'csv',
        framerate: 24,
      };

      const result = await service.exportChapters(mockChapters, options);
      const csv = result.data as string;

      expect(csv).toContain(';');
    });
  });

  describe('XML Export', () => {
    it('should export to XML format', async () => {
      const options: ExportOptions = {
        format: 'xml',
        framerate: 24,
      };

      const result = await service.exportChapters(mockChapters, options);

      expect(result.success).toBe(true);
      expect(result.format).toBe('xml');
      expect(result.filename).toBe('panelwave_export.xml');
      expect(typeof result.data).toBe('string');
    });

    it('should include XML declaration', async () => {
      const options: ExportOptions = {
        format: 'xml',
        framerate: 24,
      };

      const result = await service.exportChapters(mockChapters, options);
      const xml = result.data as string;

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<panelwave-export>');
    });

    it('should include timings section', async () => {
      const options: ExportOptions = {
        format: 'xml',
        framerate: 24,
      };

      const result = await service.exportChapters(mockChapters, options);
      const xml = result.data as string;

      expect(xml).toContain('<timings>');
      expect(xml).toContain('<panel id="panel-0"');
      expect(xml).toContain('<start>0</start>');
      expect(xml).toContain('<end>3</end>');
    });

    it('should include layers section', async () => {
      const options: ExportOptions = {
        format: 'xml',
        framerate: 24,
        includeLayers: true,
      };

      const result = await service.exportChapters(mockChapters, options);
      const xml = result.data as string;

      expect(xml).toContain('<layers>');
      expect(xml).toContain('<layer id="layer-1"');
    });

    it('should include audio section', async () => {
      const options: ExportOptions = {
        format: 'xml',
        framerate: 24,
      };

      const result = await service.exportChapters(mockChapters, options);
      const xml = result.data as string;

      expect(xml).toContain('<audio>');
      expect(xml).toContain('</audio>');
    });
  });

  describe('Error Handling', () => {
    it('should handle unsupported format', async () => {
      const options: ExportOptions = {
        format: 'invalid' as any,
        framerate: 24,
      };

      const result = await service.exportChapters(mockChapters, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported export format');
    });

    it('should include error message in result', async () => {
      const options: ExportOptions = {
        format: 'invalid' as any,
        framerate: 24,
      };

      const result = await service.exportChapters(mockChapters, options);

      expect(result.error).toBeDefined();
      expect(result.data).toBe('');
    });

    it('should handle empty chapters gracefully', async () => {
      const options: ExportOptions = {
        format: 'json',
        framerate: 24,
      };

      const result = await service.exportChapters([], options);

      expect(result.success).toBe(true);
      const json = result.data as any;
      expect(json.timings.length).toBe(0);
    });
  });

  describe('Timecode Conversion', () => {
    it('should convert seconds to timecode correctly', () => {
      const timecode0 = service['secondsToTimecode'](0, 24);
      expect(timecode0).toBe('00:00:00:00');

      const timecode1 = service['secondsToTimecode'](1, 24);
      expect(timecode1).toBe('00:00:01:00');

      const timecode60 = service['secondsToTimecode'](60, 24);
      expect(timecode60).toBe('00:01:00:00');

      const timecode3600 = service['secondsToTimecode'](3600, 24);
      expect(timecode3600).toBe('01:00:00:00');
    });

    it('should handle frames correctly', () => {
      const timecode = service['secondsToTimecode'](1.5, 24);
      expect(timecode).toBe('00:00:01:12'); // 12 frames past 1 second
    });

    it('should handle different framerates', () => {
      const timecode24 = service['secondsToTimecode'](1.5, 24);
      const timecode30 = service['secondsToTimecode'](1.5, 30);

      expect(timecode24).toBe('00:00:01:12'); // 12 frames
      expect(timecode30).toBe('00:00:01:15'); // 15 frames
    });

    it('should zero-pad correctly', () => {
      const timecode = service['secondsToTimecode'](5.25, 24);
      expect(timecode).toBe('00:00:05:06');
    });
  });

  describe('Export Result', () => {
    it('should include file size in result', async () => {
      const options: ExportOptions = {
        format: 'json',
        framerate: 24,
      };

      const result = await service.exportChapters(mockChapters, options);

      expect(result.size).toBeDefined();
      expect(result.size).toBeGreaterThan(0);
    });

    it('should generate appropriate filenames', async () => {
      const jsonResult = await service.exportChapters(mockChapters, {
        format: 'json',
        framerate: 24,
      });
      expect(jsonResult.filename).toBe('panelwave_export.json');

      const edlResult = await service.exportChapters(mockChapters, {
        format: 'edl',
        framerate: 24,
      });
      expect(edlResult.filename).toBe('panelwave_export.edl');

      const csvResult = await service.exportChapters(mockChapters, {
        format: 'csv',
        framerate: 24,
      });
      expect(csvResult.filename).toBe('panelwave_export.csv');

      const xmlResult = await service.exportChapters(mockChapters, {
        format: 'xml',
        framerate: 24,
      });
      expect(xmlResult.filename).toBe('panelwave_export.xml');
    });
  });
});
