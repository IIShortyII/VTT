// ui-text (#87, design.md D2): das deutsche Woerterbuch definiert die Menge der Textschluessel
// (`TextKey`); das englische Woerterbuch (`en.ts`) ist gegen genau diese Menge typisiert - ein
// fehlender oder ueberzaehliger Schluessel dort ist ein Typfehler. Jeder deutsche Eintrag ist
// buchstabengleich der bisherige Text der jeweiligen Ansicht (design.md Goals, "Buchstaben-
// gleich unter Deutsch"). Diese Datei importiert nichts (design.md D9).
//
// ui-status (#91, design.md D7): `status.*`, `overlay.*`, `session.ended.*`,
// `session.replaced.*`, `session.toList` und `empty.*` sind neu; `toast.reconnected` steht bei
// den uebrigen Toasts.
//
// ui-menu (#92, design.md D10): `shell.account`, `shell.changePassword` bei den
// Shell-Schluesseln, `session.showCode`, `session.code` bei den Sitzungsschluesseln,
// `menu.*` und `token.*` als neue Gruppen vor `form.stillWorking`; `start.account.password`
// entfaellt (das Kontomenue traegt den Nutzernamen als Namen, `ui-shell` "Top-Bar").
//
// session-bar (#93, design.md D8): `bar.*` als neue Gruppe nach `session.*`;
// `menu.rename`/`menu.library`/`menu.leave` am Ende von `menu.*`; `session.rename.*`/
// `session.end.*` bei den Sitzungsschluesseln; `toast.sessionRenamed` bei den Toasts;
// `session.copyCode` entfaellt (die Session-Bar kopiert ueber `bar.copyCode`).
//
// session-tabs (#94, design.md D7): `tabs.*` und `setup.*` als neue Gruppen nach `bar.*` - die
// Reiterbeschriftungen der Raumansicht und der Cluster `Bibliothek & Einrichtung` der
// Kartenverwaltung.
//
// ui-toolbar (#96, design.md D6): `tool.*`, `fog.*` und `annotation.*` als neue Gruppen nach
// den bestehenden Fog-/Anmerkungs-Schluesseln (`empty.fogAreas.*`/`empty.annotations.*`) -
// Werkzeugnamen, Chip-Beschriftungen, Zaehler, Menuetexte und die vom Client komponierten
// Chrome-Woerter der Anmerkungszeilen. `annotation.visibility.*` liefert die grossgeschriebene
// Chip-Beschriftung, `annotation.entryVisibility.*` das kleingeschriebene Eintragswort -
// getrennte Schluessel fuer denselben Begriff in zwei Rollen (design.md D6, Entscheidung).
// `menu.delete` (bestehender Schluessel) deckt den Menueeintrag `Löschen` beider Panels ab.

export const de = {
  'shell.back': 'Zurück',
  'shell.logout': 'Abmelden',
  'shell.account': 'Konto',
  'shell.changePassword': 'Passwort ändern',
  'shell.language': 'Sprache',
  'shell.footer': 'Version {version} · Build {sha}',

  'app.loading': 'Lädt …',
  'app.serverUnreachable': 'Der Server ist nicht erreichbar.',
  'app.logoutFailed': 'Abmelden fehlgeschlagen: {cause}',

  'hero.overline': 'Deine Runde',
  'hero.anonymous.title': 'Karten, Tokens, Nebel',
  'hero.anonymous.subline': 'Leite deine Runde am virtuellen Tisch oder tritt einer bei.',

  'auth.login.title': 'Anmelden',
  'auth.login.email': 'E-Mail',
  'auth.login.password': 'Passwort',
  'auth.login.submit': 'Anmelden',
  'auth.login.toRegister': 'Noch kein Konto? Registrieren',
  'auth.login.failed': 'Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.',

  'auth.register.title': 'Registrierung',
  'auth.register.username': 'Nutzername',
  'auth.register.email': 'E-Mail',
  'auth.register.password': 'Passwort',
  'auth.register.submit': 'Registrieren',
  'auth.register.toLogin': 'Ich habe schon ein Konto',
  'auth.register.failed': 'Die Registrierung ist fehlgeschlagen. Bitte versuche es erneut.',

  'auth.password.current': 'Bisheriges Passwort',
  'auth.password.new': 'Neues Passwort',
  'auth.password.submit': 'Passwort ändern',
  'auth.password.changed': 'Passwort geändert.',
  'auth.password.failed': 'Die Passwortänderung ist fehlgeschlagen. Bitte versuche es erneut.',

  'start.title': 'Meine Spielsitzungen',
  'start.subline': 'Leite eine Sitzung oder tritt mit einem Code bei.',
  'start.actions.lead': 'Sitzung leiten',
  'start.actions.join': 'Beitreten',
  'start.actions.library': 'Kartenbibliothek',
  'start.create.title': 'Neue Spielsitzung',
  'start.create.name': 'Name',
  'start.create.submit': 'Erstellen',
  'start.join.title': 'Spielsitzung beitreten',
  'start.join.code': 'Sitzungscode',
  'start.join.submit': 'Beitreten',
  'start.cancel': 'Abbrechen',
  'start.list': 'Meine Spielsitzungen',
  'start.enter': 'Betreten',
  'start.empty.title': 'Noch keine Sitzungen',
  'start.empty.hint': 'Erstelle eine Sitzung oder tritt mit einem Code bei.',
  'start.loadFailed': 'Die Spielsitzungen konnten nicht geladen werden.',
  'start.createFailed': 'Die Spielsitzung konnte nicht erstellt werden. Bitte versuche es erneut.',
  'start.joinFailed': 'Der Beitritt ist fehlgeschlagen. Bitte versuche es erneut.',

  'session.status.active': 'Läuft',
  'session.status.paused': 'Pausiert',
  'session.status.open': 'Geöffnet',
  'session.status.ended': 'Geschlossen',
  'session.role.gm': 'Spielleiter',
  'session.role.player': 'Spieler',
  'session.action.open': 'Öffnen',
  'session.action.start': 'Starten',
  'session.action.pause': 'Pausieren',
  'session.action.end': 'Beenden',
  'session.toList': 'Zur Übersicht',
  'session.ended.title': 'Sitzung beendet',
  'session.ended.message': 'Die Spielleitung hat die Sitzung beendet. Du wirst zur Übersicht geleitet.',
  'session.ended.hint': 'Die Spielsitzung wurde beendet.',
  'session.replaced.title': 'An anderer Stelle geöffnet',
  'session.replaced.message': 'Diese Spielsitzung wurde an anderer Stelle geöffnet.',
  'session.replaced.continue': 'Hier weiterspielen',
  'session.showCode': 'Sitzungscode anzeigen',
  'session.code': 'Sitzungscode',
  'session.rename.title': 'Sitzung umbenennen',
  'session.rename.name': 'Name',
  'session.rename.submit': 'Umbenennen',
  'session.rename.failed': 'Die Sitzung konnte nicht umbenannt werden. Bitte versuche es erneut.',
  'session.end.title': 'Sitzung beenden?',
  'session.end.message': 'Alle Spieler werden aus dem Raum entfernt.',
  'session.end.confirm': 'Beenden',

  'bar.label': 'Sitzung',
  'bar.rename': 'Umbenennen',
  'bar.copyCode': 'Sitzungscode kopieren',
  'bar.transport': 'Steuerung',
  'bar.settings': 'Sitzungsverwaltung',

  'tabs.label': 'Bereiche',
  'tabs.map': 'Karte',
  'tabs.tokens': 'Tokens',
  'tabs.mapsFog': 'Karten & Nebel',
  'tabs.participants': 'Teilnehmer',

  'setup.title': 'Bibliothek & Einrichtung',
  'setup.openLibrary': 'Kartenbibliothek öffnen',

  'toast.codeCopied': 'Sitzungscode kopiert',
  'toast.tokenCreated': 'Token angelegt',
  'toast.mapMounted': 'Karte eingehängt',
  'toast.annotationRemoved': 'Anmerkung entfernt',
  'toast.annotationsRemoved': 'Anmerkungen entfernt',
  'toast.reconnected': 'Verbindung wiederhergestellt',
  'toast.sessionRenamed': 'Sitzung umbenannt',

  'dialog.close': 'Schließen',
  'dialog.cancel': 'Abbrechen',
  'map.delete.title': 'Karte „{name}" löschen?',
  'map.delete.message': 'Die Karte wird aus der Bibliothek entfernt und kann nicht wiederhergestellt werden.',
  'map.delete.confirm': 'Löschen',

  'status.disconnected': 'Verbindung unterbrochen — verbinde neu…',
  'status.disconnectedByServer': 'Verbindung vom Server getrennt.',

  'overlay.paused.title': 'Pausiert',
  'overlay.paused.subline': 'Die Spielleitung hat die Sitzung angehalten.',
  'overlay.open.title': 'Noch nicht gestartet',
  'overlay.open.subline': 'Die Spielleitung hat die Sitzung noch nicht gestartet.',

  'empty.tokens.title': 'Noch keine Tokens',
  'empty.tokens.hint': 'Lege ein Token an, um es auf der Karte zu sehen.',
  'empty.tokenValues.hint': 'Sobald die Spielleitung Tokens auf die Karte setzt, erscheinen sie hier.',
  'empty.fogAreas.title': 'Noch keine Bereiche',
  'empty.fogAreas.hint': 'Markiere Zellen auf der Karte und speichere sie als Bereich.',
  'empty.annotations.title': 'Noch keine Anmerkungen',
  'empty.annotations.hint': 'Miss eine Strecke oder zeichne auf der Karte.',

  'tool.pan': 'Schwenken',
  'tool.move': 'Bewegen',

  'fog.legend': 'Fog of War',
  'fog.toolbar': 'Nebelwerkzeug',
  'fog.tool.reveal': 'Aufdecken',
  'fog.tool.hide': 'Verdecken',
  'fog.tool.area': 'Bereich markieren',
  'fog.revealAll': 'Alles aufdecken',
  'fog.hideAll': 'Alles verdecken',
  'fog.areaName': 'Bereichsname',
  'fog.saveArea': 'Bereich speichern',
  'fog.selectionCount': '{count} Zellen markiert',
  'fog.areaRevealed': '{name} aufgedeckt',
  'fog.clearSelection': 'Auswahl leeren',

  'annotation.legend': 'Messen & Zeichnen',
  'annotation.toolbar': 'Anmerkungswerkzeug',
  'annotation.tool.line': 'Strecke',
  'annotation.tool.circle': 'Kreis',
  'annotation.tool.angle': 'Winkel',
  'annotation.tool.draw': 'Zeichnen',
  'annotation.mode': 'Modus',
  'annotation.mode.grid': 'Gerastert',
  'annotation.mode.free': 'Frei',
  'annotation.visibility': 'Sichtbarkeit',
  'annotation.visibility.privat': 'Privat',
  'annotation.visibility.geteilt': 'Geteilt',
  'annotation.entryVisibility.privat': 'privat',
  'annotation.entryVisibility.geteilt': 'geteilt',
  'annotation.color': 'Farbe',
  'annotation.color.rot': 'Rot',
  'annotation.color.orange': 'Orange',
  'annotation.color.gelb': 'Gelb',
  'annotation.color.gruen': 'Grün',
  'annotation.color.blau': 'Blau',
  'annotation.color.weiss': 'Weiß',
  'annotation.unit': 'Einheit',
  'annotation.unit.meter': 'Meter',
  'annotation.unit.fuss': 'Fuß',
  'annotation.remove': 'Entfernen',
  'annotation.removeMine': 'Meine entfernen',
  'annotation.removeShared': 'Alle geteilten entfernen',
  'annotation.kind.strecke': 'Strecke',
  'annotation.kind.kreis': 'Kreis',
  'annotation.kind.winkel': 'Winkel',
  'annotation.kind.zeichnung': 'Zeichnung',
  'annotation.unknownAuthor': 'unbekannt',

  'empty.mapInstances.title': 'Noch keine Karten eingehängt',
  'empty.mapInstances.hint': 'Hänge eine Karte aus deiner Bibliothek ein.',
  'empty.library.title': 'Noch keine Karten',
  'empty.library.hint': 'Lege eine Karte mit Namen und Bild an.',

  'menu.rowActions': 'Aktionen für {name}',
  'menu.edit': 'Bearbeiten',
  'menu.assign': 'Zuweisen…',
  'menu.share': 'Freigeben…',
  'menu.center': 'Auf Karte zentrieren',
  'menu.remove': 'Entfernen',
  'menu.activate': 'Aktivieren',
  'menu.unmount': 'Aushängen',
  'menu.open': 'Öffnen',
  'menu.delete': 'Löschen',
  'menu.rename': 'Umbenennen…',
  'menu.library': 'Kartenbibliothek',
  'menu.leave': 'Verlassen',

  'token.assign.title': '{name} zuweisen',
  'token.assign.player': 'Spieler',
  'token.assign.submit': 'Zuweisen',
  'token.share.title': 'Freigaben für {name}',
  'token.remove.title': 'Token „{name}" entfernen?',
  'token.remove.message': 'Das Token wird von der Karte entfernt.',
  'token.remove.confirm': 'Entfernen',

  'form.stillWorking': 'Verbinde noch… das kann einen Moment dauern.',
} as const

export type TextKey = keyof typeof de
