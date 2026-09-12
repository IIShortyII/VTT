import type { TextKey } from './de.js'

// ui-text (#87, design.md D2): das englische Woerterbuch ist ein Objektliteral vom Typ
// `Record<TextKey, string>` - ein fehlender oder ueberzaehliger Schluessel gegenueber `de.ts`
// ist damit ein Typfehler (design.md Goals, "Compile-Zeit-Vollstaendigkeit"). Diese Datei
// importiert nur den Typ aus `de.ts`, keine Laufzeitabhaengigkeit (design.md D9).

export const en: Record<TextKey, string> = {
  'shell.back': 'Back',
  'shell.logout': 'Log out',
  'shell.language': 'Language',
  'shell.footer': 'Version {version} · Build {sha}',

  'app.loading': 'Loading …',
  'app.serverUnreachable': 'The server cannot be reached.',
  'app.logoutFailed': 'Logout failed: {cause}',

  'hero.overline': 'Your party',
  'hero.anonymous.title': 'Maps, tokens, fog',
  'hero.anonymous.subline': 'Run your game at the virtual table or join one.',

  'auth.login.title': 'Sign in',
  'auth.login.email': 'Email',
  'auth.login.password': 'Password',
  'auth.login.submit': 'Sign in',
  'auth.login.toRegister': 'No account yet? Register',
  'auth.login.failed': 'Sign-in failed. Please try again.',

  'auth.register.title': 'Registration',
  'auth.register.username': 'Username',
  'auth.register.email': 'Email',
  'auth.register.password': 'Password',
  'auth.register.submit': 'Register',
  'auth.register.toLogin': 'I already have an account',
  'auth.register.failed': 'Registration failed. Please try again.',

  'auth.password.current': 'Current password',
  'auth.password.new': 'New password',
  'auth.password.submit': 'Change password',
  'auth.password.changed': 'Password changed.',
  'auth.password.failed': 'Password change failed. Please try again.',

  'start.title': 'My game sessions',
  'start.subline': 'Run a session or join one with a code.',
  'start.actions.lead': 'Run a session',
  'start.actions.join': 'Join',
  'start.actions.library': 'Map library',
  'start.create.title': 'New game session',
  'start.create.name': 'Name',
  'start.create.submit': 'Create',
  'start.join.title': 'Join a game session',
  'start.join.code': 'Session code',
  'start.join.submit': 'Join',
  'start.cancel': 'Cancel',
  'start.list': 'My game sessions',
  'start.enter': 'Enter',
  'start.empty.title': 'No sessions yet',
  'start.empty.hint': 'Create a session or join one with a code.',
  'start.account.password': 'Change password',
  'start.loadFailed': 'The game sessions could not be loaded.',
  'start.createFailed': 'The game session could not be created. Please try again.',
  'start.joinFailed': 'Joining failed. Please try again.',

  'session.status.active': 'Running',
  'session.status.paused': 'Paused',
  'session.status.open': 'Open',
  'session.status.ended': 'Closed',
  'session.role.gm': 'Game master',
  'session.role.player': 'Player',
  'session.action.open': 'Open',
  'session.action.start': 'Start',
  'session.action.pause': 'Pause',
  'session.action.end': 'End',
}
