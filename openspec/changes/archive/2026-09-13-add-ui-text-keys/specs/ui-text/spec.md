## Purpose

Sichtbare Texte des Clients kommen aus typisierten Wörterbüchern statt aus Rohstrings im
Markup: ein deutsches und ein englisches Wörterbuch mit identischer Schlüsselmenge, eine
Sprachwahl, die im Browser gespeichert wird und ohne Wahl auf Deutsch steht, ein
Sprachschalter in der Top-Bar und ein `<html lang>`, das der aktiven Sprache folgt. Der
Server bleibt Quelle des Zustands (`constitution.md` §9); die Sprache ist eine reine
Darstellungsentscheidung des Clients und erreicht den Server nie. Aussehen und Layout nimmt
der menschliche App-Test ab (`constitution.md` §3.4).

## Begriffe

- **Wörterbuch**: eine Zuordnung von Textschlüsseln zu Texten einer Sprache. Es gibt genau
  zwei: das deutsche (`de`, `src/client/i18n/de.ts`) und das englische (`en`,
  `src/client/i18n/en.ts`).
- **Textschlüssel**: ein Schlüssel des deutschen Wörterbuchs (`session.status.active`,
  `auth.login.title`, …). Das deutsche Wörterbuch definiert die Menge der Schlüssel; das
  englische ist gegen diese Menge typisiert — ein fehlender oder überzähliger Schlüssel ist
  ein Typfehler, kein Laufzeitfehler.
- **Platzhalter**: ein Abschnitt `{name}` in einem Text, der beim Nachschlagen durch den
  übergebenen Wert ersetzt wird (`Version {version} · Build {sha}`).
- **Nachschlagen**: die Funktion `t(key, params?)` aus `src/client/i18n/locale.ts`; sie
  liefert den Text des Schlüssels in der aktiven Sprache mit ersetzten Platzhaltern.
- **Aktive Sprache**: `de` oder `en`; gehalten vom Modul `src/client/i18n/locale.ts`,
  abfragbar über `getLocale()`, setzbar über `setLocale(locale)`.
- **Gespeicherte Wahl**: der Wert unter dem `localStorage`-Schlüssel `vtt.locale`. Gültig
  sind genau `de` und `en`.
- **Standardsprache**: Deutsch. Sie gilt ohne gespeicherte Wahl und bei ungültiger
  gespeicherter Wahl. Beschriftungen, die andere Specs wörtlich nennen (`Sitzung leiten`,
  `Deine Runde`, `Läuft`, `Zurück`, …), sind die Texte der Standardsprache; unter Englisch
  gilt der Eintrag des englischen Wörterbuchs (design.md D2). Die Szenarien der übrigen
  Capabilities laufen in der Standardsprache.
- **Sprachschalter**: eine Gruppe (`role="group"`) in der Top-Bar mit dem zugänglichen Namen
  `Sprache` (unter Englisch `Language`) und zwei Schaltflächen: zugänglicher Name `Deutsch`
  mit sichtbarem Text `DE` und zugänglicher Name `English` mit sichtbarem Text `EN`. Die
  Schaltfläche der aktiven Sprache ist `disabled` und trägt `aria-current="true"`; die
  andere ist auslösbar und trägt kein `aria-current`.
- **Stylesheet**: `src/client/app/theme.css` (`ui-theme`), als Text gelesen; die Selektoren
  des Schalters sind `.app-shell-tools` und `.app-shell-locale`. Ein Selektor ist
  **vorhanden**, wenn das Stylesheet nach Normalisierung (`\s+` → ein Leerzeichen,
  Kommentare entfernt) die Zeichenfolge `<selektor> {` enthält.

## ADDED Requirements

### Requirement: Wörterbücher und Textschlüssel

Das deutsche Wörterbuch SHALL die Menge der Textschlüssel definieren, und das englische
Wörterbuch SHALL genau dieselbe Schlüsselmenge tragen — weder ein fehlender noch ein
überzähliger Schlüssel. Jeder Wert beider Wörterbücher SHALL ein nicht-leerer Text sein.
Das Nachschlagen SHALL den Text des Schlüssels in der aktiven Sprache liefern und jeden
Platzhalter `{name}` durch den übergebenen Wert ersetzen; ein Platzhalter ohne übergebenen
Wert SHALL unverändert stehen bleiben. Die Ansichten der Shell, des Hero, der Anmelde-,
Registrierungs- und Passwortformulare, der Startansicht sowie Zustandspille und
Übergangs-Schaltflächen der Raumansicht SHALL jeden sichtbaren Text über das Nachschlagen
beziehen (design.md D2 nennt die Schlüssel).

#### Scenario: Beide Wörterbücher tragen dieselben Schlüssel

- **GIVEN** das deutsche und das englische Wörterbuch
- **WHEN** die sortierten Schlüsselmengen beider Wörterbücher verglichen werden
- **THEN** sind sie identisch, und jeder Wert beider Wörterbücher ist ein Text mit
  mindestens einem Zeichen

#### Scenario: Platzhalter werden ersetzt

- **GIVEN** die aktive Sprache ist Deutsch, und der Schlüssel `shell.footer` lautet
  `Version {version} · Build {sha}`
- **WHEN** `shell.footer` mit `version: "1.2.3"` und `sha: "abc1234"` nachgeschlagen wird
- **THEN** ist das Ergebnis genau `Version 1.2.3 · Build abc1234`

### Requirement: Sprachwahl

Ohne gespeicherte Wahl SHALL die Standardsprache Deutsch gelten; eine gespeicherte Wahl
`de` oder `en` SHALL beim Start der Anwendung gelten; ein anderer gespeicherter Wert SHALL
wie keine Wahl behandelt werden. Das Setzen der aktiven Sprache SHALL die Wahl unter
`vtt.locale` speichern, `lang` des `<html>`-Elements auf die aktive Sprache setzen und
jeden sichtbaren Text, der über das Nachschlagen bezogen wird, ohne Neuladen auf die neue
Sprache umstellen. Ist der Browserspeicher nicht verfügbar (Lesen oder Schreiben wirft),
SHALL die Sprachwahl trotzdem für die laufende Seite gelten, und die Anwendung MUST NOT
daran scheitern. Die Sprache SHALL den Server nie erreichen — kein Feld einer Anfrage,
kein Socket-Ereignis.

#### Scenario: Ohne gespeicherte Wahl gilt Deutsch

- **GIVEN** der Browserspeicher enthält keinen Eintrag `vtt.locale`, und der Server meldet
  keinen angemeldeten Nutzer
- **WHEN** die Anwendung gerendert wird
- **THEN** zeigt sie die Überschrift `Anmelden`, die Schaltfläche
  `Noch kein Konto? Registrieren` und die Overline `Deine Runde`, das `<html>`-Element trägt
  `lang="de"`, und der Browserspeicher enthält weiterhin keinen Eintrag `vtt.locale`

#### Scenario: Gespeicherte Wahl gilt beim Start

- **GIVEN** der Browserspeicher enthält `vtt.locale` mit dem Wert `en`, und der Server
  meldet keinen angemeldeten Nutzer
- **WHEN** die Anwendung gerendert wird
- **THEN** zeigt sie die Überschrift `Sign in`, die Schaltfläche `No account yet? Register`
  und die Overline `Your party`, das `<html>`-Element trägt `lang="en"`, und es gibt keinen
  Text `Anmelden`

#### Scenario: Ungültige gespeicherte Wahl fällt auf Deutsch zurück

- **GIVEN** der Browserspeicher enthält `vtt.locale` mit dem Wert `fr`, und der Server
  meldet keinen angemeldeten Nutzer
- **WHEN** die Anwendung gerendert wird
- **THEN** zeigt sie die Überschrift `Anmelden`, und das `<html>`-Element trägt `lang="de"`

#### Scenario: Umschalten auf Englisch wirkt sofort und wird gespeichert

- **GIVEN** die Anwendung ist ohne gespeicherte Wahl für einen nicht angemeldeten Besucher
  gerendert und zeigt die Überschrift `Anmelden`
- **WHEN** der Besucher die Schaltfläche `English` auslöst
- **THEN** zeigt sie ohne Neuladen die Überschrift `Sign in`, die Schaltflächen `Sign in`
  und `No account yet? Register`, die Beschriftungen `Email` und `Password` und die Overline
  `Your party`; es gibt keinen Text `Anmelden`; das `<html>`-Element trägt `lang="en"`, und
  der Browserspeicher enthält `vtt.locale` mit dem Wert `en`

#### Scenario: Zurück auf Deutsch

- **GIVEN** die Anwendung ist für einen nicht angemeldeten Besucher gerendert, und die
  aktive Sprache ist Englisch (Überschrift `Sign in`)
- **WHEN** der Besucher die Schaltfläche `Deutsch` auslöst
- **THEN** zeigt sie die Überschrift `Anmelden` und die Schaltfläche
  `Noch kein Konto? Registrieren`, es gibt keinen Text `Sign in`, das `<html>`-Element
  trägt `lang="de"`, und der Browserspeicher enthält `vtt.locale` mit dem Wert `de`

#### Scenario: Nicht verfügbarer Browserspeicher bricht die Sprachwahl nicht ab

- **GIVEN** jeder Zugriff auf `localStorage` wirft, und die Anwendung ist für einen nicht
  angemeldeten Besucher gerendert (Überschrift `Anmelden`)
- **WHEN** der Besucher die Schaltfläche `English` auslöst
- **THEN** zeigt sie die Überschrift `Sign in`, das `<html>`-Element trägt `lang="en"`, und
  es wurde kein Fehler geworfen

### Requirement: Sprachschalter in der Top-Bar

Die Top-Bar SHALL in jeder Ansicht — anonym, Startansicht, Raumansicht, Kartenbibliothek —
den Sprachschalter zeigen: eine Gruppe mit dem zugänglichen Namen `Sprache` (unter Englisch
`Language`) und den Schaltflächen `Deutsch` (Text `DE`) und `English` (Text `EN`). Die
Schaltfläche der aktiven Sprache SHALL `disabled` sein und `aria-current="true"` tragen; die
Schaltfläche der anderen Sprache SHALL auslösbar sein und MUST NOT `aria-current` tragen.
Das Auslösen SHALL die aktive Sprache setzen („Sprachwahl"). Die sichtbaren Texte der
angemeldeten Startansicht und der Raumansicht (Zustandspille, Übergangs-Verben, Konto,
`Zurück`) SHALL der aktiven Sprache folgen; Nutzername, Sitzungsname, Sitzungscode und die
Marke `VTT` sind Daten bzw. Eigennamen und MUST NOT übersetzt werden.

#### Scenario: Schalter zeigt die aktive Sprache

- **GIVEN** der Browserspeicher enthält keinen Eintrag `vtt.locale`, und der Server meldet
  keinen angemeldeten Nutzer
- **WHEN** die Anwendung gerendert wird
- **THEN** enthält das `<header>` eine Gruppe `Sprache` mit genau zwei Schaltflächen:
  `Deutsch` mit dem Text `DE`, `disabled` und `aria-current="true"`, sowie `English` mit dem
  Text `EN`, nicht `disabled` und ohne `aria-current`

#### Scenario: Nach dem Umschalten wandert die Markierung

- **GIVEN** die Anwendung ist für einen nicht angemeldeten Besucher gerendert, und die
  Gruppe `Sprache` zeigt `Deutsch` als aktive Sprache
- **WHEN** der Besucher `English` auslöst
- **THEN** heißt die Gruppe `Language`, `English` ist `disabled` und trägt
  `aria-current="true"`, und `Deutsch` ist nicht `disabled` und trägt kein `aria-current`

#### Scenario: Angemeldete Startansicht unter Englisch

- **GIVEN** der Server meldet einen angemeldeten Nutzer mit dem Nutzernamen `Gandalf`, und
  `GET /api/sessions` liefert `Freitagsrunde` (`status: "gestartet"`, `role: "spielleiter"`);
  die Anwendung ist gerendert und zeigt die Schaltfläche `Sitzung leiten`
- **WHEN** der Nutzer die Schaltfläche `English` in der Top-Bar auslöst
- **THEN** zeigt sie die Überschrift der Ebene 1 `My game sessions`, die Schaltflächen
  `Run a session`, `Join`, `Map library` und `Log out`, die Liste `My game sessions` mit
  einem Eintrag, der die Überschrift `Freitagsrunde`, den Text `Running`, den Text
  `Game master` und die Schaltfläche `Enter` enthält, den Text `Gandalf` im `<header>` und
  den Text `Version 0.0.0-dev · Build dev` im `<footer>`; es gibt weder eine Schaltfläche
  `Sitzung leiten` noch den Text `Läuft`

#### Scenario: Raumansicht unter Englisch

- **GIVEN** der Browserspeicher enthält `vtt.locale` mit dem Wert `en`; der Server meldet
  einen angemeldeten Nutzer, `GET /api/sessions` liefert `Freitagsrunde`
  (`status: "geoeffnet"`, `role: "spielleiter"`), und das Acknowledgement von
  `session:enter` nennt `role: "spielleiter"`, `status: "geoeffnet"` und `code: "ABC234"`
- **WHEN** der Nutzer die Schaltfläche `Enter` der Karte auslöst und die Raumansicht
  gerendert ist (Überschrift der Ebene 1 `Freitagsrunde`)
- **THEN** zeigt das `<header>` die Schaltfläche `Back` und die Gruppe `Language`, die
  Raumansicht zeigt die Zustandspille `Open` (Klasse `status-pill`), den Code `ABC234` und
  die Schaltflächen `Start` und `End`; es gibt keine Schaltfläche `Zurück`, `Starten` oder
  `Beenden` und keinen Text `Geöffnet`

### Requirement: Stylesheet des Sprachschalters

Das Stylesheet SHALL für jeden Selektor des Schalters eine Regel enthalten und dabei den
Format-Vertrag von `ui-theme` einhalten (kein Farbwert außerhalb des Tokenblocks, kein
`@media` außer der Bewegungsabfrage, keine weiteren `@import`-Zeilen).

#### Scenario: Schalter-Selektoren vorhanden

- **GIVEN** das Stylesheet ohne Kommentare, Whitespace normalisiert
- **WHEN** nach `.app-shell-tools {` und `.app-shell-locale {` gesucht wird
- **THEN** sind beide Selektoren vorhanden, und außerhalb des Tokenblocks steht kein
  Farbwert (`#`-Hex, `rgb(`, `hsl(`)
