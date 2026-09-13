import { setLocale, useLocale, useT } from '../i18n/locale.js'

// ui-text (#87, design.md D4): der Sprachschalter der Top-Bar - genau zwei Schaltflaechen in
// der Reihenfolge DE, EN. `disabled` statt `aria-pressed` ist Vorgabe des Issues: die aktive
// Sprache ist nicht erneut waehlbar; `aria-current="true"` macht die Markierung fuer
// Screenreader lesbar, Gold (theme.css) macht sie sichtbar, Text und `disabled` machen sie
// auch ohne Farbe erkennbar. `aria-current` fehlt bei der inaktiven Sprache ganz - kein
// `aria-current="false"`. Importiert absichtlich nur `react` und `../i18n/locale.js`
// (design.md D9).

export function LocaleSwitch() {
  const locale = useLocale()
  const t = useT()

  return (
    <div className="app-shell-locale" role="group" aria-label={t('shell.language')}>
      <button
        type="button"
        className="link"
        lang="de"
        aria-label="Deutsch"
        disabled={locale === 'de'}
        aria-current={locale === 'de' ? 'true' : undefined}
        onClick={() => setLocale('de')}
      >
        DE
      </button>
      <button
        type="button"
        className="link"
        lang="en"
        aria-label="English"
        disabled={locale === 'en'}
        aria-current={locale === 'en' ? 'true' : undefined}
        onClick={() => setLocale('en')}
      >
        EN
      </button>
    </div>
  )
}
