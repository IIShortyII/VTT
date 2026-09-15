# Design — add-token-value-pulse (#99)

## D1. Zuständigkeit: Puls lebt in `PlayerTokenList`, nicht in `TokenCard`

`TokenCard` bleibt präsentational und wird von Spielleiter (`TokenPanel`) und Spieler
(`PlayerTokenList`) geteilt. Die Erkennung „welcher Wert ist gestiegen" braucht den zuletzt
empfangenen Bestand über Renders hinweg — dieser Zustand gehört in `PlayerTokenList`, nicht in
die geteilte Karte. `PlayerTokenList` merkt sich je Token die zuletzt gesehenen Zahlenwerte
(`useRef<Map<tokenId, { hp, tempHp, ac, initiative }>>`), vergleicht bei jedem neuen `tokens`
gegen den Vorwert und leitet je Token die Menge der **gestiegenen** Werte ab. Diese Menge
reicht sie der jeweiligen `TokenCard` als optionalen Eingang durch.

Der Spielleiter-Pfad (`TokenPanel`) setzt diesen Eingang nie — die Verwaltungskarten pulsieren
nicht.

## D2. Schnittstelle `TokenCard`

Neuer optionaler Prop:

```ts
type TokenStatKey = 'hp' | 'tempHp' | 'ac' | 'initiative'
export interface TokenCardProps {
  // ... bestehend ...
  pulse?: Partial<Record<TokenStatKey, boolean>>
}
```

- Jede Wertzeile rendert ihr `dd` mit der Basisklasse `token-card__value` (für **jede** Rolle).
- Ist `pulse?.<key>` `true`, trägt genau dieses `dd` zusätzlich `token-card__value--pulse`.
- `pulse` fehlt (Spielleiter) → nie die Puls-Klasse.
- Die Zuordnung Stat → `dd`: `hp` → Paar `HP` (`<hp>/<hpMax>`), `tempHp` → `Temp-HP`,
  `ac` → `RK`, `initiative` → `Initiative`.

Für `HP` zählt der Skalar `hp` (Heilung hebt `hp`); eine reine `hpMax`-Änderung pulsiert nicht.

## D3. Einmaligkeit: `animationend` entfernt die Klasse

Der Puls ist einmalig (Issue: „pulsiert einmal 0,9 s"). Die Klasse wird nach dem Ende der
CSS-Animation wieder entfernt. Umsetzung: `PlayerTokenList` hält die aktuell pulsierenden
Stats je Token als React-State (nicht nur im Ref), setzt sie beim erkannten Anstieg und
entfernt den betroffenen Eintrag im `onAnimationEnd` des `dd`. `TokenCard` reicht dafür einen
`onValuePulseEnd(key)`-Rückruf an die `dd`s durch, den nur `PlayerTokenList` belegt.

- In jsdom feuert `animationend` nicht von selbst; der Test simuliert das Ende per
  `fireEvent.animationEnd(dd)`. Ohne dieses Ereignis bleibt die Klasse stehen — das genügt den
  Anstiegs-Szenarien, die die Klasse direkt nach dem Update prüfen.

## D4. Vorwert-Vergleich (Anstiegsregel)

Beim Verarbeiten eines neuen `tokens`-Bestands, je Token und je Stat:

- Vorwert unbekannt (Token neu, oder Stat war zuvor nicht im Ref) → **kein** Puls. Vorwert im
  Ref ablegen.
- Vorwert und neuer Wert vorhanden, neuer > Vorwert → Puls (Stat in die pulsierende Menge).
- neuer ≤ Vorwert, oder neuer `null` → kein Puls.
- Ref danach auf den neuen Wert setzen.

Ein Token, das aus dem Bestand verschwindet, wird aus Ref und Puls-State entfernt (kein
Nachhall bei Wiederauftauchen). `null`-Werte gelten als „nicht vorhanden" — ein Übergang
`null → Zahl` ist ein Erscheinen, kein Anstieg.

## D5. Leerzustand-Text

`empty.tokenValues.hint` wechselt den Wert:

- `de.ts`: `'empty.tokenValues.hint': 'Die Spielleitung weist dir ein Token zu.'`
- `en.ts`: `'empty.tokenValues.hint': 'The game master will assign you a token.'`

Titel bleibt `empty.tokens.title` (`Noch keine Tokens` / `No tokens yet`). Kein neuer
i18n-Schlüssel; nur der Wert des bestehenden ändert sich. Auslöser des Leerzustands bleibt
`tokens.length === 0` (unverändert).

## D6. Stylesheet

In den **bestehenden** `@media (prefers-reduced-motion: no-preference)`-Block von
`theme.css` (die einzige Medienabfrage der Datei — kein zweiter Block) aufnehmen:

```css
.token-card__value--pulse { animation: value-pulse 0.9s ease-out; }
@keyframes value-pulse { 50% { color: var(--gold-text); transform: scale(1.08); } }
```

`--gold-text` existiert bereits im Tokenblock (`ui-theme`-Vertrag: Farbwerte nur aus Tokens).
Die Basisklasse `token-card__value` braucht keine eigene Regel (sie ist nur Anker für den
Puls), kann aber einen `display: inline-block` o. ä. bekommen, falls `transform` sonst nicht
greift — Aussehen nimmt der App-Test ab (`constitution.md` §3.4).

## D7. Vertrauensgrenze

Der Puls ist eine reine Ableitung aus zwei aufeinander folgenden, vom Server autoritativ
verteilten Beständen (`session:tokens`). Er blendet nichts aus und deckt nichts auf: welche
Werte überhaupt ankommen, filtert der Server pro Empfänger (`constitution.md` §9.2). Das
Szenario „Spieler sieht ohne Werte keine Werte" (unverändert) deckt bereits ab, dass ein nicht
freigegebener (also `null` eintreffender) Wert keine Zeile erzeugt — deshalb kein neues
Szenario dafür.

## D8. Tests (Testing-Library, keine `querySelector`-Helfer)

- Wertanzeige über die Beschreibungsliste ansprechen: den `dt` (`HP`/`Temp-HP`/`RK`/
  `Initiative`) finden und das zugehörige `dd` prüfen (`toHaveClass('token-card__value--pulse')`
  bzw. `not.toHaveClass`). Da `dd`/`dt` keine Rolle mit zugänglichem Namen tragen, ist der
  Zugriff über den Text des `dt` und dessen Geschwister-`dd` der stabile Weg.
- Zweiter Bestand kommt wie in „Tokenbestand folgt dem Server"/„Wertefelder folgen dem
  Bestand" über den Socket-Mock (`session:tokens`) an dieselbe gerenderte Raumansicht.
- Reiter `Tokens` vor dem Zugriff aktivieren (`session-tabs`, Testaufbau-Konvention).
