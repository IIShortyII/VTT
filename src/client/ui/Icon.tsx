import type { ButtonHTMLAttributes } from 'react'

import { ICON_REGISTRY, type IconName } from './icons.js'

// add-icon-registry (#85, design.md D2): `Icon` und `IconButton` sind die einzige Stelle, an
// der Zugaenglichkeit fuer Icons entschieden wird (spec.md "Zugaenglichkeit der Icons") -
// jede Aufrufstelle liefert nur `name` (und optional `label`), nicht `aria-hidden`/`role`.

export interface IconProps {
  name: IconName
  label?: string
}

/** Dekoratives Icon ohne `label` (`aria-hidden="true"`, kein `role`, kein `aria-label`) neben
 * Text; benanntes Icon mit `label` (`role="img"`, `aria-label`), wenn es allein steht
 * (design.md D2, spec.md "Icon-Komponente"). `size="1em"` setzt `width`/`height` auf `1em`,
 * die Strichfarbe bleibt `currentColor` (kein `color`-Prop). */
export function Icon({ name, label }: IconProps) {
  const Svg = ICON_REGISTRY[name]
  return <Svg className="icon" size="1em" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label} />
}

export type IconButtonProps = { name: IconName; label: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'>

/** Icon-only-Schaltflaeche: `aria-label` gleich `label`, einziges Kind ein benanntes Icon mit
 * demselben Text, kein Textknoten (design.md D2, spec.md "Icon-only-Schaltflaeche"). Ein
 * uebergebener `type` in `rest` ueberschreibt den Standard `button`. */
export function IconButton({ name, label, className, ...rest }: IconButtonProps) {
  return (
    <button type="button" className={className ? `icon-button ${className}` : 'icon-button'} aria-label={label} {...rest}>
      <Icon name={name} label={label} />
    </button>
  )
}
