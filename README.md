# Der Auserwählte – Neon-Fingerwähler für 2–10+ Finger

Alle legen einen Finger aufs Display, kurz still halten – das Schicksal wählt per frischem Zufalls-Seed einen Auserwählten. Am Desktop setzt ein Klick einen Punkt, ein Klick auf den Punkt entfernt ihn.

Das Spiel besteht aus einer einzigen statischen Datei (`index.html`) ohne Abhängigkeiten oder Build-Schritt.

## Deploy auf Cloudflare Pages

Deploy über die Git-Integration von Cloudflare Pages:

1. Im Cloudflare-Dashboard unter **Workers & Pages → Create → Pages → Connect to Git** dieses Repository auswählen.
2. Production-Branch: `main`
3. Framework preset: **None**
4. Build-Befehl: **leer lassen** (kein Build-Befehl)
5. Ausgabeverzeichnis: `/` (der Repo-Root)

Jeder Push auf `main` löst automatisch ein neues Deployment aus.

Die Datei `_headers` setzt `Cache-Control: no-cache` für alle Pfade, damit nach einem Deploy sofort die neue Version ausgeliefert wird.

## Lokal testen

`index.html` direkt im Browser öffnen oder einen beliebigen statischen Server im Repo-Root starten, z. B.:

```sh
python3 -m http.server 8000
```
