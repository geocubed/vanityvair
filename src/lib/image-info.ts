// Dimensions are read from the encoded file, never from client-supplied headers.
export function imageInfo(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, end: number) => new TextDecoder().decode(bytes.slice(start, end));
  if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    const chunk = ascii(12, 16);
    if (chunk === 'VP8X') return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16), mime: 'image/webp' };
    if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff, mime: 'image/webp' };
    if (chunk === 'VP8L' && bytes[20] === 0x2f) { const bits = view.getUint32(21, true); return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, mime: 'image/webp' }; }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 8) return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3), mime: 'image/jpeg' };
      offset += length;
    }
  }
  throw new Error('Choose a valid JPEG or WebP image.');
}
