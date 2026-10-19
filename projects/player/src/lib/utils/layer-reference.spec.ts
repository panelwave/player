import { backgroundLayerOf, layerBoxPercent, layerReferenceOf, panelArtworkAspect } from './layer-reference';
import type { Layer } from '../types';

describe('layer-reference', () => {
  const assets: Record<string, unknown> = {
    wide: { variants: [{ w: 640, h: 360 }, { w: 2752, h: 1536 }] },
    square: { width: 1536, height: 1536 },
  };
  const getAsset = (id: string) => assets[id] ?? null;

  it('picks the first z-0 image as the background', () => {
    const layers = [
      { kind: 'text', id: 't', z: 0 },
      { kind: 'image', id: 'a', assetId: 'wide' },
      { kind: 'image', id: 'b', assetId: 'square', z: 0 },
    ] as unknown as Layer[];
    expect(backgroundLayerOf(layers)?.id).toBe('a');
  });

  it('derives the aspect from the largest variant, else the asset size, else 16:9', () => {
    expect(panelArtworkAspect([{ kind: 'image', id: 'a', assetId: 'wide', z: 0 }] as Layer[], getAsset)).toBeCloseTo(2752 / 1536, 6);
    expect(panelArtworkAspect([{ kind: 'image', id: 'a', assetId: 'square', z: 0 }] as Layer[], getAsset)).toBe(1);
    expect(panelArtworkAspect([], getAsset)).toBeCloseTo(16 / 9, 6);
  });

  it('maps a reference-space rect to percent of the panel (Moby Dick inset)', () => {
    const background = { kind: 'image', id: 'bg', assetId: 'wide', z: 0, x: 0, y: 0, width: 2752, height: 1536 } as unknown as Layer;
    const inset = { kind: 'image', id: 'in', assetId: 'square', z: 1, x: 406.9, y: 475.3, width: 459.8, height: 524 } as unknown as Layer;
    const reference = layerReferenceOf([background, inset], getAsset);
    expect(reference.height).toBe(1024);
    expect(reference.width).toBeCloseTo(1024 * (2752 / 1536), 6);

    expect(layerBoxPercent(background, reference)).toEqual({ left: 0, top: 0, width: 100, height: 100 });
    const box = layerBoxPercent(inset, reference);
    expect(box.left).toBeCloseTo((406.9 / reference.width) * 100, 6);
    expect(box.top).toBeCloseTo((475.3 / 1024) * 100, 6);
    expect(box.width).toBeCloseTo((459.8 / reference.width) * 100, 6);
    expect(box.height).toBeCloseTo((524 / 1024) * 100, 6);
  });

  it('defaults a missing rect to the full reference extent and accepts legacy w/h', () => {
    const reference = { width: 2048, height: 1024, background: null };
    expect(layerBoxPercent({ kind: 'text', id: 't' } as unknown as Layer, reference)).toEqual({ left: 0, top: 0, width: 100, height: 100 });
    expect(layerBoxPercent({ kind: 'image', id: 'i', w: 1024, h: 512 } as unknown as Layer, reference)).toEqual({ left: 0, top: 0, width: 50, height: 50 });
  });
});
