import path from 'node:path'

// Liest Konfiguration ausschliesslich aus der Umgebung. Ein fehlender Pflichtwert wirft
// einen sprechenden Fehler beim Start, statt spaeter als kryptischer Fehler irgendwo tief
// in Prisma oder Fastify aufzutauchen (openspec/changes/add-user-auth/tasks.md 1.3).

export interface EnvOptions {
  default?: string
}

/**
 * Liest eine Umgebungsvariable. Ohne Default wirft ein fehlender oder leerer Wert einen
 * sprechenden Fehler; mit Default wird dieser verwendet.
 */
export function env(name: string, options: EnvOptions = {}): string {
  const value = process.env[name]
  if (value !== undefined && value !== '') {
    return value
  }
  if (options.default !== undefined) {
    return options.default
  }
  throw new Error(
    `Konfigurationsfehler: Die Umgebungsvariable "${name}" ist nicht gesetzt. Bitte in der .env-Datei ergänzen.`,
  )
}

export interface Config {
  /** Prisma-Datenquelle, siehe prisma/schema.prisma. */
  databaseUrl: string
  /**
   * Das `secure`-Attribut des Sitzungscookies. In lokaler HTTP-Entwicklung aus, in
   * Produktion an (design.md D4). Der Mensch legt den Wert in `.env` an, der Agent liest
   * ihn nur.
   */
  cookieSecure: boolean
  /** Port, auf dem der Fastify-Server hört. */
  port: number
  /**
   * Upload-Verzeichnis fuer Kartenbilder (map-library #49, design.md D2): Default
   * `./data/uploads`, relativ zum Arbeitsverzeichnis des Servers - hier absolut aufgeloest,
   * damit ein Start aus einem anderen Verzeichnis nicht stillschweigend einen anderen Ordner
   * trifft.
   */
  uploadDir: string
}

export function loadConfig(): Config {
  return {
    databaseUrl: env('DATABASE_URL'),
    cookieSecure: env('COOKIE_SECURE', { default: 'false' }) === 'true',
    port: Number(env('PORT', { default: '3001' })),
    uploadDir: path.resolve(env('UPLOAD_DIR', { default: './data/uploads' })),
  }
}
