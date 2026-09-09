// Gemeinsame Wegwerf-DB-Infrastruktur der Integrationstests (AGENTS.md, constitution.md §4.3).
//
// Jede Integrationssuite bekommt eine *eigene* SQLite-Datei unter prisma/ nach dem Muster
// `<suite>.test.db` (z. B. prisma/user-auth.test.db). So stolpern parallel laufende Jest-Worker
// nicht uebereinander: frueher teilten sich beide Suiten dieselbe prisma/test.db, loeschten und
// migrierten sie jeweils im beforeAll — im Parallellauf loeschte eine Suite der anderen die DB
// unter den Fuessen weg. Der Dateiname endet weiter auf `test.db`, damit der PreToolUse-Guard
// (.harness/guard.ts) `prisma migrate deploy` erlaubt (er prueft DATABASE_URL gegen /test\.db/);
// `.gitignore` deckt `*.db` ab.
//
// Der Aufbau ist derselbe wie zuvor dupliziert: erst die Dateien eines abgebrochenen Vorlaufs
// entfernen, dann frisch aus prisma/migrations/ per `prisma migrate deploy` aufbauen — nicht
// destruktiv, legt die SQLite-Datei an, wenn sie fehlt (design.md D5, constitution.md §6.1).
// Niemals gegen dev.db oder eine produktive Datenbank.

import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')
const DB_ARTEFAKTE = ['', '-journal', '-wal', '-shm']

export type EphemeralDb = {
  /** `file:`-URL der Suite-eigenen SQLite-Datei — das Format, das DATABASE_URL erwartet. */
  dbUrl: string
  /** Absoluter Pfad der Datenbankdatei (ohne -journal/-wal/-shm-Begleiter). */
  dbFile: string
  /** Loescht Datei und ihre Begleiter (-journal/-wal/-shm) — fuer afterAll. */
  removeDbFiles: () => void
}

/** Leitet Dateipfad und DATABASE_URL aus einem Suite-Namen ab. */
export function dbLocationOf(suite: string): { dbFile: string; dbUrl: string } {
  const dbFile = path.join(ROOT, 'prisma', `${suite}.test.db`)
  const dbUrl = `file:${dbFile.replace(/\\/g, '/')}`
  return { dbFile, dbUrl }
}

/**
 * Richtet die Wegwerf-DB der benannten Suite ein und gibt ihre Koordinaten zurueck.
 *
 * Setzt `DATABASE_URL` (und `COOKIE_SECURE=false` fuer den lokalen HTTP-Testlauf, design.md D4),
 * loescht eine eventuell liegengebliebene Datei und baut das Schema per `prisma migrate deploy`
 * auf. `DATABASE_URL` steht damit, *bevor* der Aufrufer die Server-Module bzw. den Prisma-Client
 * laedt — die Prisma-Instanz dort liest sie beim Modulstart (Ladereihenfolge beibehalten).
 */
export function setupEphemeralDb(suite: string): EphemeralDb {
  const { dbFile, dbUrl } = dbLocationOf(suite)

  const removeDbFiles = (): void => {
    for (const suffix of DB_ARTEFAKTE) {
      if (existsSync(dbFile + suffix)) rmSync(dbFile + suffix, { force: true })
    }
  }

  process.env.DATABASE_URL = dbUrl
  process.env.COOKIE_SECURE = 'false'

  removeDbFiles()
  try {
    execSync('pnpm exec prisma migrate deploy', {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'pipe',
    })
  } catch (error) {
    const details = error as { stdout?: Buffer; stderr?: Buffer }
    throw new Error(
      `prisma migrate deploy gegen die Wegwerf-DB fehlgeschlagen:\n${details.stdout ?? ''}\n${details.stderr ?? ''}`,
    )
  }

  return { dbUrl, dbFile, removeDbFiles }
}
