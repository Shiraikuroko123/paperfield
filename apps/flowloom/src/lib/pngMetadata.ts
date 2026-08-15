const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
}

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
  new DataView(bytes.buffer, bytes.byteOffset + offset, 4).setUint32(0, value >>> 0, false);
}

function chunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPhysicalResolutionChunk(dpi: number): Uint8Array {
  const pixelsPerMeter = Math.round(Math.max(1, dpi) / 0.0254);
  const chunk = new Uint8Array(21);
  writeUint32(chunk, 0, 9);
  chunk.set([112, 72, 89, 115], 4);
  writeUint32(chunk, 8, pixelsPerMeter);
  writeUint32(chunk, 12, pixelsPerMeter);
  chunk[16] = 1;
  writeUint32(chunk, 17, crc32(chunk.subarray(4, 17)));
  return chunk;
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function setPngDpiMetadata(bytes: Uint8Array, dpi: number): Uint8Array {
  if (bytes.length < PNG_SIGNATURE.length
    || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    throw new Error('PNG data has an invalid signature.');
  }

  const parts: Uint8Array[] = [bytes.slice(0, PNG_SIGNATURE.length)];
  const physicalResolution = createPhysicalResolutionChunk(Number.isFinite(dpi) ? dpi : 96);
  let offset = PNG_SIGNATURE.length;
  let hasHeader = false;
  let hasEnd = false;

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error('PNG data contains a truncated chunk.');
    const length = readUint32(bytes, offset);
    const end = offset + length + 12;
    if (end > bytes.length) throw new Error('PNG data contains a truncated chunk.');
    const type = chunkType(bytes, offset);
    if (type !== 'pHYs') parts.push(bytes.slice(offset, end));
    if (type === 'IHDR') {
      hasHeader = true;
      parts.push(physicalResolution);
    }
    if (type === 'IEND') hasEnd = true;
    offset = end;
  }

  if (!hasHeader || !hasEnd) throw new Error('PNG data is missing required chunks.');
  return concatenate(parts);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function withPngDpiMetadata(dataUrl: string, dpi: number): string {
  const separator = dataUrl.indexOf(',');
  const header = separator >= 0 ? dataUrl.slice(0, separator) : '';
  if (!/^data:image\/png(?:;[^,]*)?;base64$/i.test(header)) {
    throw new Error('Expected a base64 PNG data URL.');
  }
  const bytes = decodeBase64(dataUrl.slice(separator + 1));
  return `${header},${encodeBase64(setPngDpiMetadata(bytes, dpi))}`;
}
