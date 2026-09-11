// URL des Kartenbilds einer Spielsitzung (add-fog-of-war #16, design.md D7) - hinter der
// geprueften Route `GET /api/sessions/:id/map-image`: dem Spielleiter das Original (ohne
// Version), einem Spieler mit der aktuellen Fog-Version als Abfrageparameter, damit eine
// neue Version die Kartenansicht auf das neue Bild umstellt (`MapCanvas` laedt nur bei
// geaenderter URL-Zeichenkette neu).

export function sessionMapImageUrl(sessionId: string, fogVersion: number | null): string {
  const base = `/api/sessions/${encodeURIComponent(sessionId)}/map-image`
  return fogVersion === null ? base : `${base}?fog=${fogVersion}`
}
