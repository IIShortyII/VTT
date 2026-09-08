// Laeuft vor JEDER Harness-Testdatei (jest.config.cjs -> setupFiles).
//
// Mehrere Tests rufen next(), gate() oder cleanup() direkt auf. Ohne diesen Schalter wuerde
// jeder dieser Aufrufe einen echten Board-Zugriff ausloesen - fuer erfundene Issue-Nummern wie
// "__orch_test_3__", deren Aufloesung zwar scheitert, aber erst nach einem Netzwerk-Roundtrip
// (design.md D7). Tests, die den Board-Zugriff selbst pruefen, nehmen den Schalter fuer ihre
// Dauer bewusst zurueck und setzen ihn danach wieder.
process.env.HARNESS_BOARD = 'off'
