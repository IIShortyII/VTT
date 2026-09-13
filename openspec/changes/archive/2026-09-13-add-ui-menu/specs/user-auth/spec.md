## MODIFIED Requirements

### Requirement: Passwortänderung in der Oberfläche

Die Anwendung SHALL einem angemeldeten Nutzer in jeder angemeldeten Ansicht ein Formular
zur Passwortänderung anbieten — in einem Modal (`ui-dialog`) mit dem Titel
`Passwort ändern`, das der Eintrag `Passwort ändern` des Kontomenüs (`ui-shell`) öffnet —
und die Antwort des Servers sichtbar machen: den Erfolg als
Toast `Passwort geändert.` im Toast-Host (`ui-feedback`), eine Ablehnung mit `field` als Feldfehler des genannten Feldes (`ui-form`), eine Ablehnung
ohne `field` und einen Netzfehler als Formularfehler. Nach einem Erfolg MUST NOT das
Formular eine Meldung mit `role="alert"` zeigen. Das Formular SHALL dem Formularmuster
folgen: Felder `Bisheriges Passwort` (`currentPassword`) und `Neues Passwort`
(`newPassword`), Absende-Schaltfläche `Passwort ändern`; gültig ist der Zustand, den
`ChangePasswordInputSchema` akzeptiert. Solange das Modal nicht geöffnet ist, MUST NOT das
Formular gerendert sein. Beim Öffnen SHALL das Feld `Bisheriges Passwort` den Fokus
erhalten. Nach einem Erfolg SHALL das Modal schließen, und der Fokus SHALL zur
Menü-Schaltfläche des Kontos zurückkehren; Esc und `Schließen` schließen es ohne Anfrage. Eine
Ablehnung MUST NOT den Nutzer abmelden; die Anwendung bleibt in der angemeldeten Ansicht
(`constitution.md` §9.1).

#### Scenario: Angemeldete Ansicht bietet die Passwortänderung an

- **GIVEN** der Server meldet einen angemeldeten Nutzer mit dem Nutzernamen `Gandalf`
- **WHEN** die Anwendung gerendert wird und der Nutzer die Schaltfläche `Gandalf` im
  `<header>` auslöst und den Menüeintrag `Passwort ändern` wählt
- **THEN** gab es vor dem Öffnen kein Feld `Bisheriges Passwort` im Dokument; danach
  existiert ein Element der Rolle `dialog` mit dem Namen `Passwort ändern`, das die Felder
  `Bisheriges Passwort` (mit dem Fokus) und `Neues Passwort` sowie eine Schaltfläche
  `Passwort ändern` enthält (die Abmeldung liegt im Kontomenü, `ui-shell`)

#### Scenario: Abgelehnte Passwortänderung wird angezeigt

- **GIVEN** das Modal `Passwort ändern` ist über das Kontomenü geöffnet und das Formular
  ausgefüllt
- **WHEN** der Nutzer `Passwort ändern` auslöst und der Server die Änderung mit `403`, einer
  Meldung und `field` gleich `currentPassword` ablehnt
- **THEN** trägt das Feld `Bisheriges Passwort` `aria-invalid="true"` und verweist per `aria-describedby` auf ein
  Element mit der Rolle `alert` und dieser Meldung, das Feld `Neues Passwort` trägt kein `aria-invalid`, der
  Toast-Host zeigt keinen Toast, und die Anwendung bleibt in der angemeldeten Ansicht

#### Scenario: Passwort ändern bleibt gesperrt bei zu kurzem neuen Passwort

- **GIVEN** das Modal `Passwort ändern` ist über das Kontomenü geöffnet, `Bisheriges Passwort` ist
  ausgefüllt und `Neues Passwort` enthält 14 Zeichen
- **WHEN** die Schaltfläche `Passwort ändern` angeklickt und das Formular abgeschickt wird
- **THEN** ist die Schaltfläche `Passwort ändern` gesperrt, und es wurde keine Anfrage an
  `/api/auth/password` gesendet

#### Scenario: Erfolgreiche Passwortänderung wird bestätigt

- **GIVEN** das Modal `Passwort ändern` ist über das Kontomenü geöffnet und das Formular
  ausgefüllt
- **WHEN** der Nutzer `Passwort ändern` auslöst und der Server die Änderung mit `200`
  bestätigt
- **THEN** zeigt der Toast-Host (`role="status"`) einen Toast `Passwort geändert.`, es existiert kein Element der Rolle `dialog` mehr, die Menü-Schaltfläche des Kontos hat
  den Fokus, und die Anwendung bleibt in der angemeldeten Ansicht
