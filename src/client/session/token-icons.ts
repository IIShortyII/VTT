import { TOKEN_ICONS, type TokenIcon } from '../../shared/token.js'
import type { IconName } from '../ui/icons.js'

// add-icon-registry (#85, design.md D3): `shared/` darf `client/` nicht kennen, deshalb
// steht die Typpruefung "jeder Symbolkatalog-Name ist ein `IconName`" hier - ein
// Katalogname ausserhalb der Registry waere ein Typfehler.
export const TOKEN_ICON_NAMES: readonly IconName[] = TOKEN_ICONS

/** Beschriftungen der Symbolkatalog-Eintraege im Client (design.md D3, spec.md
 * "Symbolkatalog"). */
export const TOKEN_ICON_LABELS: Record<TokenIcon, string> = {
  fighter: 'Kämpfer',
  guardian: 'Wächter',
  undead: 'Untoter',
  dragon: 'Drache',
  mage: 'Magier',
  archer: 'Schütze',
  royal: 'Adel',
  beast: 'Bestie',
  vermin: 'Ungeziefer',
  fire: 'Feuer',
}
