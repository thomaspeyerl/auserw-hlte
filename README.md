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
- `.assetsignore` ist eine Positivliste: ausgeliefert wird nur `index.html`, nicht `.git`, `tests/`, `README.md` oder die Konfiguration.

Alternativ funktioniert auch Cloudflare Pages (Connect to Git, kein Build-Befehl, Ausgabeverzeichnis `/`).

## Lokal testen

`index.html` direkt im Browser öffnen oder einen beliebigen statischen Server im Repo-Root starten, z. B.:

```sh
python3 -m http.server 8000
```

## Wie fair ist die Auswahl?

Der Zufallskern steht in `index.html` im Block `<script id="fate">` und kommt ohne DOM aus:

1. Jede Runde holt einen frischen 128-Bit-Seed aus `crypto.getRandomValues` (Web Crypto) und mischt Zeit und Touch-Bewegungen dazu.
2. Daraus erzeugt der Pseudozufallsgenerator **sfc32** die Ziehung: Gewinner und Startpunkt der Markierung werden unabhängig voneinander gleichverteilt gezogen.
3. Die Markierung springt danach 3–5 Runden im Kreis und hält genau auf dem bereits gezogenen Gewinner. Die Animation ist reine Show und beeinflusst das Ergebnis nicht.

## Tests

```sh
node --test
```

- `tests/fairness.test.mjs` prüft den echten Zufallskern aus `index.html` mit rund 1,8 Millionen simulierten Runden. Geprüft werden: Gleichverteilung für 2–12 Spieler, kein Vorteil durch Auflege-Reihenfolge oder Anordnung, Unabhängigkeit von Startpunkt und Vorrunde, eindeutige Seeds, sfc32 gegen eine Referenzimplementierung, der Fallback ohne Web Crypto und eine Gegenprobe, die eine absichtlich eingebaute Verzerrung von 2 % erkennt.
- `tests/e2e.test.mjs` spielt komplette Runden in Chromium durch: Multitouch am Handy und Klicks am Desktop. Er prüft, dass die sichtbare Markierung auf dem gezogenen Gewinner endet. Ohne installiertes [Playwright](https://playwright.dev) wird er übersprungen.

Benötigt wird nur Node.js ab Version 20.
