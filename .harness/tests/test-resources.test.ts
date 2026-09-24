// Sichert die Speicherbegrenzung der App-Testsuite (openspec/changes/limit-test-memory, #140).
// jest.config.cjs liegt ausserhalb aller Rollenpfade; ohne diesen Test koennte ein spaeterer
// Change die Werte still zurueckdrehen (design.md D4).
import { availableParallelism } from 'node:os'
import { join } from 'node:path'

const REPO_ROOT = join(__dirname, '..', '..')

test('Worker-Zahl und Speicherlimit sind konfiguriert', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const config = require(join(REPO_ROOT, 'jest.config.cjs'))
  expect(config.maxWorkers).toBeGreaterThanOrEqual(1)
  expect(config.maxWorkers).toBeLessThanOrEqual(4)
  expect(config.maxWorkers).toBeLessThanOrEqual(Math.max(1, availableParallelism() - 1))
  expect(config.workerIdleMemoryLimit).toBe('1GB')
})
