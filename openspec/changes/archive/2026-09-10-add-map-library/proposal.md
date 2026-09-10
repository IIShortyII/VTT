## Why

Das VTT hat Nutzer (#12, #13, #45) und Spielsitzungen als Raum (#6), aber nichts, worauf
gespielt wird: keine Karte, kein Raster, keine Fläche, auf der Tokens (#8) und Fog of War
(#9) später leben. Issue #7 („Karte setzen und für alle anzeigen") ist in der Explore-Runde
vom 2026-09-10 in zwei Teile geschnitten worden; dieser Change ist Teil 1 (Issue #49): die
**Kartenbibliothek** eines Nutzers samt der ersten PixiJS-Einbindung. Teil 2 (#50) hängt die
Karten anschließend in Spielsitzungen ein und verteilt sie an alle Teilnehmer.

Der Schnitt trennt „Rendering und Geometrie" (hier) von „Synchronisation und Berechtigung
im Raum" (#50). Dieser Teil trägt das Risiko des ersten PixiJS-Codes in einem Projekt, dessen
Tests unter jsdom laufen, und das Risiko der Hex-Geometrie; er ist ohne Sitzungsbezug
vollständig testbar und abnehmbar.

## What Changes

- **Kartenbibliothek pro Nutzer.** Ein angemeldeter Nutzer legt Karten mit Namen an, listet,
  benennt um und löscht sie. Die Bibliothek ist privat: jede Route prüft pro Anfrage, dass der
  Anfragende der Besitzer ist. Eine fremde und eine unbekannte Karte sind für den Anfragenden
  nicht unterscheidbar (`constitution.md` §9.2).
- **Kartenbild hochladen.** PNG, JPEG oder WebP, höchstens 20 MB, als roher Bild-Body mit
  `Content-Type: image/*` — kein Multipart, keine neue Dependency. Der Server prüft die
  Dateisignatur gegen den angegebenen Typ. Das Bild liegt im Dateisystem neben der DB
  (Verzeichnis aus der Umgebung, Dateiname vom Server vergeben), nicht als Blob in der DB.
  Ein erneuter Upload ersetzt das vorige Bild und entfernt dessen Datei.
- **Bild ausliefern nur über eine geprüfte Route.** Kein statischer Ordner: eine erratbare
  URL darf keine Karte preisgeben. Die Route prüft pro Anfrage den Besitzer (in #50 kommt
  „Mitglied einer Spielsitzung, in der die Karte eingehängt ist" hinzu).
- **Raster als Eigenschaft der Karte.** Typ `quadrat`, `hex-spitz` (Spitze oben) oder
  `hex-flach` (flache Kante oben); Zellgröße als Abstand zweier paralleler Kanten in Pixeln
  (bei Quadraten die Kantenlänge); Versatz in x und y. Das Raster gehört zum Bild, nicht zur
  Sitzung — eine Korrektur wirkt später überall, wo die Karte eingehängt ist.
- **Rastergeometrie als reine Funktionen in `shared/`.** Zellmittelpunkt, Zelle zu einem
  Punkt, Zellecken und Zellbereich für alle drei Rastertypen — das, was der Loop testen kann,
  und das, worauf Einrasten (#8), Fog (#9) und Messen (#11) aufbauen.
- **Erste PixiJS-Einbindung.** Eine Kartenansicht zeigt Bild und Raster auf einem Canvas mit
  Schwenken (Ziehen) und Zoomen (Mausrad um den Zeiger). Die Sicht ist lokal je Betrachter.
  PixiJS-Objekte werden beim Verlassen der Ansicht zerstört. Die Sichtmathematik (Zoom um
  einen Punkt, Grenzen) ist eine reine Funktion und wird getestet; das Zeichnen selbst nimmt
  der menschliche App-Test ab (`constitution.md` §3.4).
- **Oberfläche.** Aus der Sitzungsliste erreichbar: Liste der eigenen Karten, „Neue Karte"
  (Name plus Bilddatei), Detailansicht mit Canvas, Rasterformular (Typ, Zellgröße, Versatz),
  Umbenennen, Bild ersetzen, Löschen.
- **Testinfrastruktur.** PixiJS läuft nicht unter jsdom. Die Mock-Grenze ist die
  Canvas-Fassade des Clients (ein Modul, das als Einziges PixiJS importiert), nicht die
  Bibliothek selbst — Komponententests ersetzen die Fassade, kein `moduleNameMapper`-Eintrag
  nötig (Abweichung von der Vorannahme in AGENTS.md, begründet in design.md).

**Nicht im Umfang:** Karten in Spielsitzungen einhängen und aktivieren, Broadcast an den
Raum, Anzeige für Spieler, Löschsperre für eingehängte Karten (alles #50); Tokens, Fog,
Messen; Bildgrößen-Erkennung auf dem Server; Bildkompression oder Thumbnails; Teilen von
Karten zwischen Nutzern.

## Capabilities

### New Capabilities
- `map-library`: Anlegen, Auflisten, Ändern und Löschen eigener Karten; Hochladen und
  geprüftes Ausliefern des Kartenbilds; Rastermodell und Rastergeometrie; Kartenansicht mit
  Schwenken und Zoomen; Oberfläche der Bibliothek. Umfasst die Regel, dass jede Kartenroute
  pro Anfrage den Besitzer prüft.

### Modified Capabilities
Keine. `game-session` bleibt unverändert: die Sitzungsliste bekommt einen Einstieg in die
Bibliothek, aber keine ihrer Requirements ändert sich; die bestehenden Szenarien der
Sitzungsoberfläche gelten weiter. `user-auth` wird nur benutzt (Cookie-Sitzung).

## Impact

**Schema** (`prisma/schema.prisma`): neues Modell `GameMap` (Besitzer, Name, Bilddatei und
-typ, Rastertyp, Zellgröße, Versatz) mit Gegenrelation an `User`. Die Migration führt der
Agent nur gegen die Wegwerf-DB aus (§5.1, §6.1).

**Konfiguration:** neue, optionale Umgebungsvariable `UPLOAD_DIR` (Default `./data/uploads`,
relativ zum Arbeitsverzeichnis des Servers). Das Verzeichnis wird beim Start angelegt. Der
Ordner `data/` gehört in `.gitignore` und die Variable in `.env.example` — beides außerhalb
der Rollen-Pfadbereiche, erledigt die Session vor dem PR (tasks.md, Abschluss).

**Neuer Code:**
- `src/shared/map.ts` — zod-Verträge für Karten, Raster, Upload-Grenzen; Drahtformat
- `src/shared/grid.ts` — Rastergeometrie (reine Funktionen, drei Rastertypen)
- `src/server/map/` — Dateiablage (Signaturprüfung, Schreiben, Löschen), Regeln, REST-Routen
- `src/client/map/` — REST-Anbindung, Sichtmathematik, PixiJS-Fassade, Kartenansicht,
  Bibliotheksansicht

**Geänderter Code:**
- `src/server/core/config.ts` — `UPLOAD_DIR`
- `src/server/core/app.ts` — Content-Type-Parser für Bilder, Upload-Verzeichnis als
  injizierbare Option, Registrierung der Kartenrouten
- `src/client/app/App.tsx`, `src/client/session/SessionList.tsx` — Einstieg in die Bibliothek

**Dependencies:** keine neuen. `pixi.js@8` liegt seit dem Projektstart in `package.json`,
wurde aber nie importiert.

**Testinfrastruktur:** Integrationstests brauchen ein Wegwerf-Upload-Verzeichnis je Suite
(temporärer Ordner, nach dem Lauf entfernt) und rohe Binär-Bodies über `app.inject()`.
Komponententests mocken REST und Canvas-Fassade; die Geometrie- und Sichtfunktionen werden
direkt getestet.
