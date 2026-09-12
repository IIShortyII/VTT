import type { ReactNode } from 'react'

// add-start-view (#86, design.md D1): der Hero ist die einzige Stelle, die die Ueberschrift
// der Ebene 1 der Startansicht traegt - Anmelde-/Registrierungsformular und Sitzungsliste
// haben keine eigene mehr. `Hero` importiert absichtlich nur `react` (design.md D9); die
// Gedankenstriche der Overline kommen aus dem Stylesheet (`.hero-overline::before/::after`),
// der Text bleibt exakt "Deine Runde" (Barrierefreiheit: kein doppelt vorgelesenes Zeichen).

export interface HeroProps {
  title: string
  subline: string
  actions?: ReactNode
}

export function Hero({ title, subline, actions }: HeroProps) {
  return (
    <section className="hero">
      <p className="hero-overline">Deine Runde</p>
      <h1 className="hero-title">{title}</h1>
      <p className="hero-subline">{subline}</p>
      {actions && <div className="hero-actions">{actions}</div>}
    </section>
  )
}
