/**
 * QR code modules as one SVG path (`uqr`), for the share dialog and the
 * print cards of the content widgets.
 */
import { encode } from 'uqr';

export interface QrModules {
  /** SVG path of the dark modules, one unit per module. */
  path: string;
  /** Modules per side, quiet zone included (the SVG viewBox). */
  size: number;
}

/**
 * Encode `text` (medium error correction). Null when it is empty or too
 * long to encode — no code rather than a broken one.
 */
export function qrModules(text: string, border = 4): QrModules | null {
  if (!text) return null;
  try {
    const qr = encode(text, { ecc: 'M', border });
    let path = '';
    qr.data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) path += `M${x} ${y}h1v1h-1z`;
      });
    });
    return { path, size: qr.size };
  } catch {
    return null;
  }
}
