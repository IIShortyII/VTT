// ui-text (#87, design.md D2): das deutsche Woerterbuch definiert die Menge der Textschluessel
// (`TextKey`); das englische Woerterbuch (`en.ts`) ist gegen genau diese Menge typisiert - ein
// fehlender oder ueberzaehliger Schluessel dort ist ein Typfehler. Jeder deutsche Eintrag ist
// buchstabengleich der bisherige Text der jeweiligen Ansicht (design.md Goals, "Buchstaben-
// gleich unter Deutsch"). Diese Datei importiert nichts (design.md D9).

export const de = {
  'shell.back': 'Zurück',
  'shell.logout': 'Abmelden',
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
  'start.account.password': 'Passwort ändern',
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
  'session.copyCode': 'Kopieren',

  'toast.codeCopied': 'Sitzungscode kopiert',
  'toast.tokenCreated': 'Token angelegt',
  'toast.mapMounted': 'Karte eingehängt',
  'toast.annotationRemoved': 'Anmerkung entfernt',
  'toast.annotationsRemoved': 'Anmerkungen entfernt',
} as const

export type TextKey = keyof typeof de
