## MODIFIED Requirements

### Requirement: Bibliotheksoberfläche

Die angemeldete Ansicht SHALL aus der Sitzungsliste einen Wechsel zur Kartenbibliothek
anbieten. Die Bibliothek SHALL die eigenen Karten mit Namen und Bildstatus auflisten, das
Anlegen einer Karte mit Namen und Bilddatei in einem Schritt erlauben (Karte anlegen, dann
Bild hochladen), und eine Karte zur Bearbeitung öffnen: Kartenansicht mit Bild und Raster,
Formular für Name und Raster, Bild ersetzen, Löschen nach Bestätigung, Zurück zur Liste.
Die Bestätigung SHALL über den Bestätigungsdialog von `ui-dialog` laufen: `Löschen` öffnet
einen `alertdialog` mit dem Titel `Karte „<Name>" löschen?` (`ui-text`, `map.delete.title`),
der Beschreibung `Die Karte wird aus der Bibliothek entfernt und kann nicht wiederhergestellt
werden.` und der bestätigenden Schaltfläche `Löschen` (Klasse `danger`); erst dessen
Bestätigung sendet `DELETE`. Abbrechen des Dialogs MUST NOT eine Anfrage senden. Die
Anwendung MUST NOT einen zweiten Klick auf dieselbe Schaltfläche als Bestätigung werten.

Was die Kartenansicht zeigt, SHALL ausschließlich aus Antworten des Servers stammen — ein
gespeichertes Raster wird mit dem Wert aus der Antwort gezeichnet, nicht mit der Eingabe
(`constitution.md` §9.1). Ein vom Server gemeldeter Fehlschlag SHALL sichtbar sein. Beim
Verlassen der Kartenansicht SHALL die Anwendung die Canvas-Ressourcen genau einmal freigeben.

#### Scenario: Einstieg aus der Sitzungsliste

- **GIVEN** ein angemeldeter Nutzer sieht die Sitzungsliste
- **WHEN** er „Kartenbibliothek" wählt
- **THEN** zeigt die Anwendung die Bibliothek mit dem Formular „Neue Karte" und hat die
  Kartenliste vom Server abgefragt

#### Scenario: Liste zeigt eigene Karten mit Bildstatus

- **GIVEN** der Server liefert die Karten „Taverne" (mit Bild) und „Wald" (ohne Bild)
- **WHEN** die Bibliothek gerendert wird
- **THEN** zeigt sie beide Namen, und „Wald" ist als Karte ohne Bild gekennzeichnet

#### Scenario: Neue Karte mit Bild anlegen

- **GIVEN** die Bibliothek ist gerendert
- **WHEN** der Nutzer den Namen „Krypta" eingibt, eine PNG-Datei wählt und das Formular
  abschickt
- **THEN** sendet die Anwendung `POST /api/maps` mit `{ "name": "Krypta" }`, danach
  `PUT /api/maps/<id>/image` mit `Content-Type: image/png` und der Datei als Body, und lädt
  danach die Liste neu

#### Scenario: Karte öffnen zeigt Kartenansicht und Rasterformular

- **GIVEN** die Bibliothek zeigt die Karte „Taverne" mit Bild und dem Raster `quadrat`, 70,
  0, 0
- **WHEN** der Nutzer „Taverne" öffnet
- **THEN** erzeugt die Anwendung die Kartenansicht mit der Bild-URL `/api/maps/<id>/image`
  und diesem Raster, und das Formular zeigt Typ `quadrat`, Zellgröße 70 und Versatz 0/0

#### Scenario: Gespeichertes Raster kommt vom Server

- **GIVEN** die Karte „Taverne" ist geöffnet
- **WHEN** der Nutzer Typ `hex-spitz` und Zellgröße 50 eingibt und speichert, und der Server
  mit der Karte antwortet, deren Raster `hex-spitz` mit Zellgröße 55 trägt
- **THEN** hat die Anwendung `PATCH /api/maps/<id>` mit `{ "grid": { "type": "hex-spitz",
  "size": 50, "offsetX": 0, "offsetY": 0 } }` gesendet, und die Kartenansicht zeichnet das
  Raster mit Zellgröße 55

#### Scenario: Abgelehnter Upload wird angezeigt

- **GIVEN** die Karte „Taverne" ist geöffnet
- **WHEN** der Nutzer ein Bild ersetzt und der Server mit `413` und einer Meldung antwortet
- **THEN** zeigt die Anwendung diese Meldung als Fehlermeldung an

#### Scenario: Löschen nach Bestätigung

- **GIVEN** die Karte „Taverne" ist geöffnet
- **WHEN** der Nutzer „Löschen" in der Kartenansicht wählt
- **THEN** gibt es einen Dialog mit der Rolle `alertdialog` und dem Namen
  `Karte „Taverne" löschen?`, dessen Beschreibung `Die Karte wird aus der Bibliothek
  entfernt und kann nicht wiederhergestellt werden.` lautet, mit den Schaltflächen
  `Abbrechen` und `Löschen` (Klasse `danger`), und es wurde noch kein
  `DELETE /api/maps/<id>` gesendet; wählt der Nutzer `Löschen` innerhalb des Dialogs,
  sendet die Anwendung `DELETE /api/maps/<id>`, kehrt zur Liste zurück, und „Taverne" ist
  nicht mehr aufgeführt

#### Scenario: Abgebrochenes Löschen sendet nichts

- **GIVEN** die Karte „Taverne" ist geöffnet, und der Löschdialog ist über „Löschen" offen
- **WHEN** der Nutzer `Abbrechen` im Dialog wählt
- **THEN** gibt es keinen Dialog mit der Rolle `alertdialog` mehr, es wurde kein
  `DELETE /api/maps/<id>` gesendet, die Kartenansicht „Taverne" ist weiterhin gerendert,
  und der Fokus liegt auf der Schaltfläche „Löschen" der Kartenansicht

#### Scenario: Verlassen gibt die Kartenansicht frei

- **GIVEN** die Karte „Taverne" ist geöffnet
- **WHEN** der Nutzer zur Liste zurückkehrt
- **THEN** hat die Anwendung die Canvas-Ressourcen der Kartenansicht genau einmal freigegeben
