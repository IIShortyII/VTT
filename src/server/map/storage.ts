import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ImageMimeType } from '../../shared/map.js'

// Dateiablage neben der DB (design.md D2): Signaturpruefung, Schreiben, Loeschen - alles ueber
// `node:fs/promises` mit injiziertem Verzeichnis, damit Tests gegen `os.tmpdir()` laufen.
// Der Dateiname stammt nie vom Client - immer `<mapId>-<token>.<ext>` mit einem serverseitig
// erzeugten Token (constitution.md §9, Path-Traversal strukturell ausgeschlossen).

const EXTENSION_BY_MIME_TYPE: Record<ImageMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff])
const WEBP_RIFF = Buffer.from('RIFF', 'ascii')
const WEBP_WEBP = Buffer.from('WEBP', 'ascii')

/** Prueft die Dateisignatur (die ersten Bytes) gegen die bekannten Bildtypen (design.md D3):
 * PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`, WebP `52 49 46 46 ?? ?? ?? ?? 57 45 42 50`.
 * Liefert den erkannten MIME-Typ oder `null`, wenn keine Signatur passt. */
export function detectSignature(bytes: Buffer): ImageMimeType | null {
  if (bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return 'image/png'
  }
  if (bytes.length >= JPEG_SIGNATURE.length && bytes.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) {
    return 'image/jpeg'
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).equals(WEBP_RIFF) && bytes.subarray(8, 12).equals(WEBP_WEBP)) {
    return 'image/webp'
  }
  return null
}

function generateToken(): string {
  return randomBytes(4).toString('hex')
}

/** Absoluter Pfad einer abgelegten Bilddatei im Upload-Verzeichnis. Der Pfad wird immer aus
 * `dir` und einem serverseitig vergebenen Dateinamen gebildet, nie aus Anfrageparametern
 * (design.md D2, constitution.md §9). */
export function imagePath(dir: string, fileName: string): string {
  return path.join(dir, fileName)
}

/** Legt das Upload-Verzeichnis an, falls es noch nicht existiert (design.md D2, `onReady`). */
export async function ensureUploadDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

/** Schreibt ein neues Bild ins Upload-Verzeichnis und liefert den vergebenen Dateinamen
 * (design.md D2). `mapId` und `type` bestimmen Praefix und Endung, ein zufaelliges Token
 * sorgt dafuer, dass ein Ersetzen nie in dieselbe Datei schreibt, die gerade ausgeliefert
 * wird. */
export async function writeImage(dir: string, mapId: string, type: ImageMimeType, bytes: Buffer): Promise<string> {
  const fileName = `${mapId}-${generateToken()}.${EXTENSION_BY_MIME_TYPE[type]}`
  await writeFile(imagePath(dir, fileName), bytes)
  return fileName
}

/** Liest eine abgelegte Bilddatei. */
export async function readImage(dir: string, fileName: string): Promise<Buffer> {
  return readFile(imagePath(dir, fileName))
}

/** Entfernt eine abgelegte Bilddatei - idempotent: ein bereits fehlendes Ziel (`ENOENT`) ist
 * erreicht, kein Fehler (design.md D2). Jeder andere Fehler wandert zum zentralen Handler. */
export async function removeImage(dir: string, fileName: string): Promise<void> {
  try {
    await rm(imagePath(dir, fileName))
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
      return
    }
    throw error
  }
}
