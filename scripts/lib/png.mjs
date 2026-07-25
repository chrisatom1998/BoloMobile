import { readFileSync } from 'node:fs';

const PNG_SIGNATURE = '89504e470d0a1a0a';

/**
 * Reads the IHDR header of a PNG file and returns its dimensions and encoding.
 *
 * @param {string} filePath Absolute path to the PNG file.
 * @param {string} [label] Human-readable name used in error messages (defaults to filePath).
 * @returns {{ width: number, height: number, bitDepth: number, colorType: number }}
 */
export function pngInfo(filePath, label = filePath) {
  const file = readFileSync(filePath);
  if (file.length < 26) throw new Error(`${label} is not a valid PNG.`);
  if (file.subarray(0, 8).toString('hex') !== PNG_SIGNATURE || file.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error(`${label} is not a valid PNG.`);
  }
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
    bitDepth: file.readUInt8(24),
    colorType: file.readUInt8(25),
  };
}
