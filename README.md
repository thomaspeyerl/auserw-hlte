# Der Auserwählte – Neon-Fingerwähler für 2–10+ Finger

Alle legen einen Finger aufs Display, ein Countdown 3 – 2 – 1 läuft (kommt ein Finger dazu oder geht einer weg, beginnt er neu) – dann wählt das Schicksal per frischem Zufalls-Seed einen Auserwählten. Am Desktop setzt ein Klick einen Punkt, ein Klick auf den Punkt entfernt ihn.

Das Spiel besteht aus einer einzigen statischen Datei (`index.html`) ohne Abhängigkeiten oder Build-Schritt.

## Grafik

- **3D-Arena (WebGL):** Synthwave-Welt mit Horizont, gestreifter Retro-Sonne, Bergsilhouetten und einem Boden-Gitter in Perspektive, über das die Kamera fährt. Das Tempo hängt vom Spiel ab: gemächlich im Startbildschirm, Beschleunigung bei der Auswahl, fast Stillstand vor der Entscheidung, Warp-Stoß beim Gewinner. Das Gitter krümmt sich um jeden Finger.
- **3D-Sternenstaub:** Er fliegt auf die Kamera zu und zieht bei hoher Geschwindigkeit Warp-Streifen.
- **3D-Krone:** Echtes Modell aus Gold mit Spiegelungen, Perlen und Edelsteinen in der Farbe des Gewinners. Sie fällt mit Federung ein und dreht sich.
- **Effekte:** Neon-Finger, Energie-Strahlen, Radarstrahl, Blitze, Schockwellen, Funken und Konfetti, Bloom in zwei Stufen, Verzerrung, Glitch, Farbsaum, Vignette und Scanlines.
- **Automatische Qualität:** Kommt ein Gerät nicht hinterher, senkt das Spiel die interne Auflösung von selbst.
- **Ersatz-Grafik:** Ohne WebGL oder nach einem Absturz des Grafikkontexts schaltet das Spiel auf eine Canvas-2D-Darstellung um.
- **Oberfläche:** Logo, Statusanzeige, Titel und Schalter sind HTML/CSS (Schrift: Orbitron).

## Sound

- **Live erzeugt:** Musik und Effekte entstehen live mit Web Audio, ohne Audiodateien (`<script id="music">`): Synthwave in a-Moll bei 104 BPM mit Kick, Snare, Hi-Hats, Bass, Arpeggio, Flächen, Hall und Echo.
- **Musik folgt dem Spiel:** ruhig im Startbildschirm, Riser und Pieptöne im Countdown, treibender Beat bei der Auswahl (der Filter öffnet sich mit jedem Sprung), Stille mit Herzschlag vor der Entscheidung, Einschlag und Siegesmelodie beim Gewinner.
- **Schalter:** Musik und Ton lassen sich getrennt abschalten; die Einstellung wird gespeichert.
- **Vibration:** Auf Geräten, die es unterstützen, vibriert das Handy im Takt der Herzschläge und beim Gewinner.

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
3. Die Markierung springt danach erst wild kreuz und quer zwischen den Fingern hin und her. Dann läuft sie ein bis zwei Runden im Uhrzeigersinn aus, wird immer langsamer und hält genau auf dem bereits gezogenen Gewinner. Der Weg ist reine Show: Er wird erst nach dem Gewinner aus demselben Seed erzeugt und beeinflusst das Ergebnis nicht.

## Tests

```sh
node --test
```

- `tests/fairness.test.mjs` prüft den echten Zufallskern aus `index.html` mit rund 1,8 Millionen simulierten Runden. Geprüft werden: Gleichverteilung für 2–12 Spieler, kein Vorteil durch Auflege-Reihenfolge oder Anordnung, Unabhängigkeit von Startpunkt und Vorrunde, eindeutige Seeds, sfc32 gegen eine Referenzimplementierung, der Fallback ohne Web Crypto und eine Gegenprobe, die eine absichtlich eingebaute Verzerrung von 2 % erkennt.
- `tests/e2e.test.mjs` spielt komplette Runden in Chromium durch: Multitouch am Handy, Klicks am Desktop und die Ersatz-Grafik ohne WebGL. Er prüft, dass die sichtbare Markierung auf dem gezogenen Gewinner endet. Außerdem rendert er die Musik-Engine offline durch alle Spielphasen und prüft Lautstärke, Übersteuerung und die Stille vor der Entscheidung. Ohne installiertes [Playwright](https://playwright.dev) wird er übersprungen.

Benötigt wird nur Node.js ab Version 20.
