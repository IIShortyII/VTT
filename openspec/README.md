# openspec/

Dieses Verzeichnis wird von OpenSpec verwaltet. Initialisieren mit:

    pnpm dlx @fission-ai/openspec init --tools claude
    # danach das erweiterte Profil aktivieren:
    pnpm dlx @fission-ai/openspec config profile   # -> workflows
    pnpm dlx @fission-ai/openspec update

Danach liegen hier:
- specs/            — die Spec-Baseline (Source of Truth)
- changes/         — aktive Changes (Intent-Quelle für den feature-loop)
- changes/archive/ — gemergte Changes (Audit-Historie)

Naht zur Harness: OpenSpec macht die Intent-Ebene
(/opsx:propose, /opsx:update), der feature-loop ersetzt /opsx:apply für die
Umsetzung, /opsx:archive beim Merge. Beim Init den von OpenSpec erzeugten AGENTS.md-Block
mit der bestehenden AGENTS.md abgleichen (OpenSpec nutzt verwaltete Marker).
