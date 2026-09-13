## Why

Der Client ist hartkodiert deutsch (`lang="de"` in `index.html`, kein Textmechanismus), und
zwei Stellen der Raumansicht rendern interne Werte statt Beschriftungen: `Zustand: geoeffnet`
zeigt den Rohwert des Serverzustands, die Übergangs-Schaltflächen des Spielleiters tragen
den Aktionsnamen (`starten`, `beenden`) aus dem Vertrag statt eines Verbs. Mit #83–#86
liegen Shell, Hero, Startansicht und Sitzungskarten in ihrer endgültigen Form vor — dieser
Change (Issue #87, letztes Kind des Epics #101) zieht die sichtbaren Texte dieser Ansichten
auf typisierte Textschlüssel, führt ein zweites Wörterbuch (Englisch) und einen
Sprachschalter DE/EN in der Top-Bar ein und ersetzt die beiden Rohstring-Stellen im Raum
durch Zustandspille und Verben.

Entscheidungen aus dem Issue-Text (#87, #101) und der Explore-Runde (2026-09-13):
- **Umfang: Fundament plus fertige Ansichten.** Über Textschlüssel laufen die Shell
  (`Zurück`, `Abmelden`, Footer), Hero und anonyme Startansicht, Anmelde-, Registrierungs-
  und Passwortformular, die angemeldete Startansicht mit Sitzungskarten sowie im Raum genau
  die im Issue genannten Stellen: Zustandspille und Übergangs-Verben. Die übrigen Texte der
  Raumansicht (Teilnehmer, Karte, Tokens, Fog, Anmerkungen) und die Kartenbibliothek bleiben
  Rohstrings, bis Epic C/D (#93–#100) diese Ansichten neu baut — jeder dieser Changes zieht
  seine Texte dann verpflichtend über `ui-text`. Folge: unter Englisch sind Raum und
  Bibliothek vorerst gemischtsprachig; das ist gewollt und im App-Test bekannt.
- **Sprachwahl im Browser, Standard Deutsch.** Die Wahl liegt unter dem `localStorage`-
  Schlüssel `vtt.locale` und überlebt einen Reload; ohne Eintrag (oder mit ungültigem Wert)
  gilt Deutsch. Keine Ermittlung aus der Browsersprache: sie wäre umgebungsabhängig, und die
  Testumgebung meldet `en-US` — jede bestehende Suite kippte auf Englisch. Keine Ablage am
  Nutzerkonto (Schema, Migration, Vertrag; anonyme Besucher bräuchten trotzdem einen
  Browser-Rückfall).
- **Servertexte bleiben deutsch.** Validierungs- und Ablehnungstexte kommen aus den
  zod-Verträgen in `shared/` und vom Server; der Client zeigt sie unverändert, also unter
  Englisch weiterhin deutsch. Dieser Change fasst Server und `shared/` nicht an; die
  Umstellung auf Fehlercodes mit clientseitiger Übersetzung ist als Folge-Issue #109
  angelegt.
- **Mechanik ohne Dependency.** Ein Modul hält die aktive Sprache; `t(key)` liest sie beim
  Aufruf und ist überall aufrufbar (auch außerhalb von React), Komponenten abonnieren die
  Sprache über `useSyncExternalStore`, damit sie beim Umschalten neu rendern. Kein Provider,
  keine Bibliothek: für zwei Sprachen und rund sechzig Schlüssel wäre i18next mehr Maschine
  als Nutzen, und die Typisierung `Record<keyof typeof de, string>` aus dem Issue bringt die
  Vollständigkeitsprüfung zur Compile-Zeit ohne Zusatzwerkzeug.
- **Datenwerte sind keine UI-Texte.** Der Zustandskatalog der Token-Markierungen
  (`conditions.ts`) wird als Text an den Server gesendet und gespeichert; eine Übersetzung
  änderte die Daten. Er bleibt deutsch und außerhalb dieses Change.

## What Changes

- **Neue Capability `ui-text`:** zwei Wörterbücher mit identischer Schlüsselmenge (Deutsch
  als Quelle der Schlüssel, Englisch typgeprüft dagegen), `t(key)` mit Platzhaltern,
  Sprachwahl mit Persistenz unter `vtt.locale` und Standard Deutsch, `<html lang>` folgt der
  aktiven Sprache, Sprachschalter DE/EN in der Top-Bar (aktive Sprache `disabled`, Gold,
  `aria-current="true"`), Stylesheet-Regeln dafür.
- **Shell, Hero, Auth-Formulare, Startansicht:** alle sichtbaren Beschriftungen und
  clientseitigen Meldungen dieser Ansichten laufen über Textschlüssel. Unter Deutsch ändert
  sich kein Text und keine Adresse — bestehende Tests bleiben grün.
- **Raumansicht (`game-session`, MODIFIED):** `Zustand: <rohwert>` wird zur Zustandspille
  nach der Zuordnungstabelle aus `ui-start` (Text, Icon, Varianten-Klasse); die
  Übergangs-Schaltflächen tragen Verben (`Öffnen`, `Starten`, `Pausieren`, `Beenden`) statt
  Aktionsnamen. Der Name der Sitzung bleibt die Überschrift der Ebene 1 und wird zum Anker
  „Raumansicht ist gerendert" in den Szenarien, die bisher `Zustand:` suchten.
- **Top-Bar (`ui-shell`, MODIFIED):** rechte Zone bekommt neben dem Konto den
  Sprachschalter, in jeder Ansicht — auch für nicht angemeldete Besucher.
- **Sitzungskarten (`ui-start`, MODIFIED):** das Betreten-Szenario erkennt die Raumansicht an
  Überschrift und Zustandspille statt an `Zustand:`; Pillentext und Rolle sind Texte der
  aktiven Sprache.
- **Spec-Konvention:** Beschriftungen, die andere Specs wörtlich nennen (`Sitzung leiten`,
  `Deine Runde`, `Läuft`, …), gelten für die Standardsprache Deutsch. Unter einer anderen
  Sprache gilt der Eintrag des jeweiligen Wörterbuchs; die Szenarien der übrigen
  Capabilities laufen in der Standardsprache und ändern sich nicht.

## Capabilities

### New Capabilities
- `ui-text`: Wörterbücher und Textschlüssel, Sprachwahl mit Persistenz und Standard,
  Sprachschalter in der Top-Bar, `<html lang>`, Stylesheet des Schalters.

### Modified Capabilities
- `game-session`: Requirement „Sitzungsoberfläche" — Raumansicht zeigt den Zustand als
  Zustandspille statt als Rohwert, Übergangs-Schaltflächen tragen Verben; vier Szenarien
  benennen Pille und Verben statt `Zustand: …`/`starten`.
- `ui-shell`: Requirement „Top-Bar" — Sprachschalter in der rechten Zone jeder Ansicht; zwei
  Szenarien (anonyme Ansicht, Zurück aus dem Raum) nennen Schalter bzw. den neuen Anker der
  Raumansicht.
- `ui-start`: Requirement „Sitzungskarten" — Texte der Pille und Rolle in der aktiven
  Sprache; das Betreten-Szenario erkennt die Raumansicht an Überschrift und Pille.

## Impact

- Neu: `src/client/i18n/de.ts`, `src/client/i18n/en.ts`, `src/client/i18n/locale.ts`,
  `src/client/app/LocaleSwitch.tsx`.
- Geändert: `src/client/app/AppShell.tsx`, `App.tsx`, `Hero.tsx`,
  `src/client/auth/LoginForm.tsx`, `RegisterForm.tsx`, `ChangePasswordForm.tsx`,
  `src/client/session/SessionList.tsx`, `session-status.ts`, `SessionRoom.tsx` (nur
  Zustandszeile und Übergangs-Schaltflächen), `src/client/app/theme.css` (Abschnitt
  „Textschlüssel").
- Unverändert: Server, `shared/`, Prisma-Schema, `index.html` (das statische `lang="de"`
  bleibt der Anfangswert, die Laufzeit setzt das Attribut), Kartenbibliothek, Panels der
  Raumansicht, `conditions.ts`.
- Keine neue Dependency. Kein Datenbank- oder API-Vertragswechsel.
- Bestehende Tests: nur die in den MODIFIED-Deltas genannten Szenarien ändern ihre Anker;
  alle übrigen Beschriftungen bleiben unter Deutsch buchstabengleich.
