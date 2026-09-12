-- add-icon-registry (#85): bestehende Token.icon-Werte (Emoji des frueheren
-- Symbolkatalogs) auf die Namen der Icon-Registry umschreiben (design.md D7). Jeder
-- andere gespeicherte Wert (freier Text, veraltetes Emoji ausserhalb des Katalogs) wird
-- NULL ("kein Symbol", wie bei einem nicht gesetzten icon) - kein Datenverlust ueber das
-- hinaus, was vorher schon nicht im festen Katalog stand. Idempotent: ein zweiter Lauf
-- aendert nichts mehr, weil kein icon-Wert mehr einem Emoji entspricht. Kein
-- Schemawechsel - "icon" bleibt String? (schema.prisma unveraendert).

UPDATE "Token" SET "icon" = 'fighter' WHERE "icon" = '⚔️';
UPDATE "Token" SET "icon" = 'guardian' WHERE "icon" = '🛡️';
UPDATE "Token" SET "icon" = 'undead' WHERE "icon" = '💀';
UPDATE "Token" SET "icon" = 'dragon' WHERE "icon" = '🐉';
UPDATE "Token" SET "icon" = 'mage' WHERE "icon" = '🧙';
UPDATE "Token" SET "icon" = 'archer' WHERE "icon" = '🏹';
UPDATE "Token" SET "icon" = 'royal' WHERE "icon" = '👑';
UPDATE "Token" SET "icon" = 'beast' WHERE "icon" = '🐺';
UPDATE "Token" SET "icon" = 'vermin' WHERE "icon" = '🕷️';
UPDATE "Token" SET "icon" = 'fire' WHERE "icon" = '🔥';

UPDATE "Token" SET "icon" = NULL WHERE "icon" IS NOT NULL AND "icon" NOT IN ('fighter', 'guardian', 'undead', 'dragon', 'mage', 'archer', 'royal', 'beast', 'vermin', 'fire');
