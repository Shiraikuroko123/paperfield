import { describe, expect, it } from 'vitest';
import { setPngDpiMetadata, withPngDpiMetadata } from './pngMetadata';

const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlrcAAAAASUVORK5CYII=';

function decodeDataUrl(dataUrl: string): Uint8Array {
  return Uint8Array.from(atob(dataUrl.split(',')[1]), (character) => character.charCodeAt(0));
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
}

function physicalResolutionChunks(bytes: Uint8Array): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === 'pHYs') chunks.push(bytes.slice(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  return chunks;
}

describe('PNG publication metadata', () => {
  it('writes one physical-resolution chunk at the requested DPI', () => {
    const output = decodeDataUrl(withPngDpiMetadata(ONE_PIXEL_PNG, 300));
    const chunks = physicalResolutionChunks(output);
    expect(chunks).toHaveLength(1);
    expect(readUint32(chunks[0], 0)).toBe(11811);
    expect(readUint32(chunks[0], 4)).toBe(11811);
    expect(chunks[0][8]).toBe(1);
  });

  it('replaces existing physical-resolution metadata instead of duplicating it', () => {
    const once = setPngDpiMetadata(decodeDataUrl(ONE_PIXEL_PNG), 300);
    const twice = setPngDpiMetadata(once, 600);
    const chunks = physicalResolutionChunks(twice);
    expect(chunks).toHaveLength(1);
    expect(readUint32(chunks[0], 0)).toBe(23622);
  });
});
