import type { ReactNode } from 'react'

import { useT } from '../i18n/locale.js'

// add-start-view (#86, design.md D1): der Hero ist die einzige Stelle, die die Ueberschrift
// der Ebene 1 der Startansicht traegt - Anmelde-/Registrierungsformular und Sitzungsliste
// haben keine eigene mehr. Die Gedankenstriche der Overline kommen aus dem Stylesheet
// (`.hero-overline::before/::after`), der Text bleibt exakt "Deine Runde" unter Deutsch
// (Barrierefreiheit: kein doppelt vorgelesenes Zeichen). ui-text (#87, design.md D6): die
// Overline kommt jetzt ueber `t('hero.overline')`; `title`/`subline` bleiben Props - die
// Aufrufer uebergeben nachgeschlagene Texte. `Hero` importiert dafuer zusaetzlich
// `../i18n/locale.js`.

export interface HeroProps {
  title: string
  subline: string
  actions?: ReactNode
}

export function Hero({ title, subline, actions }: HeroProps) {
  const t = useT()
  return (
    <section className="hero">
      <p className="hero-overline">{t('hero.overline')}</p>
      <h1 className="hero-title">{title}</h1>
      <p className="hero-subline">{subline}</p>
      {actions && <div className="hero-actions">{actions}</div>}
    </section>
  )
}
