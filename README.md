# Der Auserwählte – Neon-Fingerwähler für 2–10+ Finger

Alle legen einen Finger aufs Display, kurz still halten – das Schicksal wählt per frischem Zufalls-Seed einen Auserwählten. Am Desktop setzt ein Klick einen Punkt, ein Klick auf den Punkt entfernt ihn.

Das Spiel besteht aus einer einzigen statischen Datei (`index.html`) ohne Abhängigkeiten oder Build-Schritt.

## Deploy auf Cloudflare

Das Spiel läuft als Cloudflare Worker mit statischen Assets und wird über die Git-Integration (Workers Builds) deployt:

- Worker-Name: `auserw-hlte` (muss zu `name` in `wrangler.jsonc` passen)
- Production-Branch: `main`
- Build-Befehl: **leer** (kein Build-Befehl)
- Deploy-Befehl: `npx wrangler deploy`
- Ausgabeverzeichnis: der Repo-Root (`assets.directory: "."` in `wrangler.jsonc`)

Jeder Push auf `main` löst automatisch ein neues Deployment aus.

- `_headers` setzt `Cache-Control: no-cache` für alle Pfade, damit nach einem Deploy sofort die neue Version ausgeliefert wird.
- `.assetsignore` sorgt dafür, dass nur das Spiel ausgeliefert wird und nicht `.git`, `README.md`, `LICENSE` oder die Konfiguration.

Alternativ funktioniert auch Cloudflare Pages (Connect to Git, kein Build-Befehl, Ausgabeverzeichnis `/`).

## Lokal testen

`index.html` direkt im Browser öffnen oder einen beliebigen statischen Server im Repo-Root starten, z. B.:

```sh
python3 -m http.server 8000
```
