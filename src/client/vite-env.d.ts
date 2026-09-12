// Vite-Defines der App-Shell (ui-shell #84, design.md D2). `vite.config.ts` setzt beide ueber
// `define` (Version aus `package.json`, SHA aus `git rev-parse --short HEAD`); ohne Vite-Lauf
// (z. B. unter Jest) existieren die Bezeichner nicht - `main.tsx` prueft das per
// `typeof`-Waechter und faellt auf `FALLBACK_BUILD` zurueck.

declare const __APP_VERSION__: string
declare const __BUILD_SHA__: string
