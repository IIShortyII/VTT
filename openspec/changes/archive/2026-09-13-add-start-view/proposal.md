## Why

Die Startansicht ist heute eine schlichte Liste: `SessionList.tsx` rendert Sitzungen als
`<ul>` mit „Name – Rolle – Status" als Rohtext, ohne Leerzustand (wer keine Sitzungen hat,
sieht eine leere Liste), und Erstellen, Beitreten und Passwortänderung stehen gleichrangig
als drei offene Formulare untereinander. Für einen anonymen Besucher beginnt die Seite
direkt mit dem Anmeldeformular. Mit #83 (`ui-theme`), #84 (`ui-shell`) und #85 (`ui-icons`)
stehen Tokens, Grundelemente, Shell und Icons — dieser Change (Issue #86, Kind des Epics
#101) gibt der Startansicht ihre Form: eine Hero-Zeile mit Overline, Display-Titel und
Subline, darunter für den Besucher die Anmeldekarte, für den angemeldeten Nutzer zwei
klare Aktionen und die Sitzungen als Karten mit Status-Pille und Rolle.

Entscheidungen aus dem Issue-Text (#86, #101) und der Explore-Runde (2026-09-12):
- **Aufklapp-Panels statt Modal.** Das Issue nennt ein „Erstellen-Modal"; der
  `<Modal>`-Baustein kommt erst mit #89. `Sitzung leiten` und `Beitreten` schalten je ein
  `.panel` mit dem bekannten Formular unter der Hero-Zeile ein (gegenseitig exklusiv, mit
  `Abbrechen`); #89 hebt dieselben Formulare später ins Modal, ohne dass Beschriftungen
  oder Verhalten sich ändern. Kein halbes `role="dialog"` ohne Focus-Trap, kein natives
  `<dialog>` (#101: kein natives UI; jsdom kennt `showModal` nicht).
- **Passwortänderung bleibt in der Startansicht, aber zugeklappt.** Der Umzug in ein Modal
  hinter dem Kontomenü braucht #89 und #92; bis dahin liegt das Formular unten in einem
  `<details>` mit Summary `Passwort ändern`. Die `user-auth`-Spec bleibt sinngemäß gültig.
- **Texte des Hero.** Overline in beiden Zuständen `Deine Runde` (Gedankenstriche per CSS,
  nicht als Text, damit Screenreader nur die Wörter lesen). Anonym: Titel
  `Karten, Tokens, Nebel`, Subline `Leite deine Runde am virtuellen Tisch oder tritt einer
  bei.` Angemeldet: Titel `Meine Spielsitzungen`, Subline `Leite eine Sitzung oder tritt
  mit einem Code bei.`
- **Zustand → Pille** ausschließlich aus dem vom Server gemeldeten `status`
  (`constitution.md` §9.1): `gestartet` → `--active` „Läuft" (Icon `start`), `pausiert` →
  `--paused` „Pausiert" (`pause`), `geoeffnet` → neutral „Geöffnet" (`players`),
  `geschlossen` → `--ended` „Geschlossen" (`lock`). Rolle als `Spielleiter` / `Spieler` mit
  Icon `user`. Text trägt die Information, das Icon ist Zugabe (#101: nie Farbe allein).
- **Kartenbibliothek** wird dritte, leise Aktion der Hero-Zeile (`.link` mit Icon
  `library`) statt der Schaltfläche ganz oben.
- **Ladephase:** solange `GET /api/sessions` läuft, erscheint weder Liste noch Leerzustand;
  `Noch keine Sitzungen` nur nach geladener leerer Liste.
- **Capability heißt `ui-start`.** Hero, Aktionen und Formular-Panels, Sitzungskarten,
  Leerzustand und Stylesheet-Selektoren der Startansicht. Die Raumansicht bleibt in
  `game-session`.
- **Nachlese aus #84:** das Text-Chevron `‹` der Shell wird `<Icon name="back">`; die tote
  Prop `user` der Sitzungsliste entfällt.

## What Changes

- **Hero** `src/client/app/Hero.tsx` (neu): Overline `Deine Runde`, `<h1>` als Display-Titel,
  Subline, optional eine Aktionszeile. Wird in beiden Zuständen gerendert.
- **Anonyme Startansicht** (`App.tsx`): Hero, darunter Anmelde- bzw.
  Registrierungsformular als `.panel`-Karte; Umschalter (`Noch kein Konto? Registrieren`,
  `Ich habe schon ein Konto`) als `button.link`, Absenden als `button.primary`; die
  Formular-Überschriften werden `<h2>` (der Hero trägt die `<h1>`).
- **Angemeldete Startansicht** (`SessionList.tsx`): Hero mit `Sitzung leiten` (gold),
  `Beitreten`, `Kartenbibliothek` (`.link`); Erstellen- und Beitreten-Formular als
  aufklappbare `.panel`s mit `Abbrechen`, gegenseitig exklusiv; Sitzungen als Karten
  (Name in Display-Serif, Status-Pille mit Icon und Text, Rolle mit Icon, Schaltfläche
  `Betreten`) in einer benannten Liste; Leerzustand `Noch keine Sitzungen` /
  `Erstelle eine Sitzung oder tritt mit einem Code bei.`; Passwortänderung in einem
  zugeklappten `<details>` ganz unten. Prop `user` entfällt.
- **Zustandstabelle** `src/client/session/session-status.ts` (neu): Beschriftung, Icon und
  Pillen-Variante je gemeldetem Zustand; Rollenbeschriftungen.
- **Shell**: Chevron der Schaltfläche `Zurück` als `<Icon name="back">`.
- **Passwortformular**: ohne eigene `<h2>` (die Summary ist die Überschrift), Labels als
  `.field-label`.
- **Stylesheet** `src/client/app/theme.css`: Abschnitt „Startansicht" mit den zwölf
  Selektoren der Startansicht, vor dem Bewegungsblock, Format-Vertrag von `ui-theme`
  eingehalten.

**Nicht im Umfang:** Modal und Confirm (#89), Kontomenü (#92), Toasts (#88), Textschlüssel
(#87), Session-Bar und Raumansicht (#93ff.), Responsive-Regeln (#100), Rasterlayout der
Karten bei schmalem Viewport, Sortierung oder Filterung der Sitzungen, Änderungen an
Server-Routen oder Schema.

## Capabilities

### New Capabilities

- `ui-start`: Hero der Startansicht (2 Szenarien), Erstellen und Beitreten auf Anforderung
  (6), Sitzungskarten (3), Leerzustand (3), Stylesheet der Startansicht (1).

### Modified Capabilities

- `game-session`: „Sitzungsoberfläche" — die Sitzungsliste zeigt Erstellen und Beitreten
  als Aktionen, die Formulare erscheinen erst auf Anforderung; das Szenario „Sitzungsliste
  mit Erstellen und Beitreten" beschreibt Karte, Aktionen und die noch nicht sichtbaren
  Felder.
- `ui-shell`: „Top-Bar" — die angemeldete Startansicht ist an der Schaltfläche
  `Sitzung leiten` erkennbar (statt am Formular `Neue Spielsitzung`); die Schaltfläche
  `Zurück` trägt ein dekoratives Icon statt des Text-Chevrons.
- `user-auth`: „Passwortänderung in der Oberfläche" — das Formular liegt zugeklappt in
  einem `<details>` mit Summary `Passwort ändern` am Ende der Startansicht.

## Impact

**Keine neue Dependency. Kein Schema, keine Migration, kein Server-Code.**

**Geänderter Code:**
- `src/client/app/Hero.tsx`, `src/client/session/session-status.ts` (neu)
- `src/client/app/App.tsx`, `src/client/app/AppShell.tsx`
- `src/client/session/SessionList.tsx`
- `src/client/auth/LoginForm.tsx`, `src/client/auth/RegisterForm.tsx`,
  `src/client/auth/ChangePasswordForm.tsx`
- `src/client/app/theme.css` (Abschnitt „Startansicht")

**Bestehende Tests:** Vier Szenarien der `ui-shell`-Suite erkennen die Sitzungsliste am
Text `Neue Spielsitzung` — dieser Anker verschwindet hinter dem Aufklapp-Panel; sie
erkennen sie künftig an der Schaltfläche `Sitzung leiten`. Das `game-session`-Szenario
„Sitzungsliste mit Erstellen und Beitreten" erwartet Name- und Code-Feld sofort — künftig
erst nach Auslösen der Aktion. Das `user-auth`-Szenario zur Passwortänderung findet die
Felder weiterhin (ein zugeklapptes `<details>` hält seinen Inhalt im DOM). Alle
Raum-Suiten betreten den Raum über die erste Schaltfläche `/betreten/i` — die Hero-Aktion
`Beitreten` matcht dieses Muster nicht, die Karten-Schaltfläche `Betreten` weiterhin.
`Kartenbibliothek` bleibt eine Schaltfläche mit diesem Namen.
