# Fingerspiele – Der Auserwählte, Last Finger Standing und Königsfinger

Die Startseite (`index.html`) ist eine Spiele-Auswahl mit drei Kacheln; jedes Spiel hat oben links einen Knopf zurück zur Auswahl.

| Pfad | Spiel |
|---|---|
| `/auserwaehlt/` | Der Auserwählte – Neon-Fingerwähler für 2–10+ Finger |
| `/lastfinger/` | Last Finger Standing – Bomben-K.-o. bis nur einer übrig ist |
| `/koenigsfinger/` | Königsfinger – mittelalterliche Burgenschlacht, auch online und als Android-App |

## Der Auserwählte

Alle legen einen Finger aufs Display, ein Countdown 3 – 2 – 1 läuft (kommt ein Finger dazu oder geht einer weg, beginnt er neu) – dann wählt das Schicksal per frischem Zufalls-Seed einen Auserwählten. Am Desktop setzt ein Klick einen Punkt, ein Klick auf den Punkt entfernt ihn.

Das Spiel besteht aus einer einzigen statischen Datei (`auserwaehlt/index.html`) ohne Abhängigkeiten oder Build-Schritt.

## Zweites Spiel: Last Finger Standing

Unter `/lastfinger/` (Datei `lastfinger/index.html`) liegt ein eigenständiges zweites Spiel mit derselben Grafik, Musik und demselben Zufallskern:

- **Start:** Finger auflegen, Countdown 3 – 2 – 1 – LOS.
- **Runden:** In jeder Runde springt eine Bombe erst wild zwischen den Fingern umher und läuft dann aus. Wo sie landet, zischt die Lunte, und der Finger explodiert. Er scheidet aus und bekommt seinen Platz.
- **Finale:** Die letzten zwei spielen ein Finale mit Herzschlag. Wer übrig bleibt, hat „ÜBERLEBT!“ und bekommt die Krone.
- **Fairness:** Die komplette Ausscheide-Reihenfolge wird vorab per Fisher-Yates aus dem Seed gemischt, jede der n! Reihenfolgen ist gleich wahrscheinlich. Die Wege der Bombe entstehen erst danach und enden immer beim geplanten Opfer.

Beide Spiele sind unabhängige Kopien; Änderungen an einem wirken sich nicht auf das andere aus.

## Drittes Spiel: Königsfinger

Unter `/koenigsfinger/` liegt ein Trinkspiel für 2–8 Leute (am besten 3–6) im Mittelalter-Stil: Low-Poly-3D mit Schatten, wechselndem Wetter (Tag, Sonnenuntergang, Vollmond, Gewitter, Wintersturm), Ultra-Gore und einem Herold, der steirisch-mittelalterlich ansagt.

- **Burgen bauen:** Reihum tippt jeder dorthin, wo seine Burg stehen soll – mit Ziegelgeräusch. Farbe und Wappentier werden zugelost.
- **Fünf Türme = fünf Leben.** Jeder Treffer reißt einen Turm ein. Wachen stürzen brennend von der Mauer oder zerplatzen, Blut läuft die Mauern hinunter und spritzt aus den Turmstümpfen. Fällt der letzte Turm, wird die Burg zur blutigen Ruine, der Burgherr zum Geist, und Krähen kommen.
- **Runde:** Zünden → Countdown → Angriff (Fadenkreuz mit Trommelwirbel) → Wahl. Die Zahl der Geschosse pro Runde steigt je nach Tempo (kurz/mittel/lang, höchstens Lebende − 1).
- **Getroffen?** Wer Türme verliert und noch steht, wählt **Angriffs-Boost** oder **Schild**. Der Schild fängt genau einen Treffer ab, bis etwas einschlägt. Den Boost hebt man auf und zündet ihn selbst vor dem Countdown. Seine Wirkung wird vor dem Spiel gewählt:
  - Doppelschaden: diese Runde kosten Treffer auf fremde Burgen zwei Türme.
  - Extra-Einschlag: ein Geschoss mehr auf eine zufällige andere Burg.
  - Eigenes Ziel: Ihr wählt, wen es trifft.

  Ob man Buffs sammeln darf, ist einstellbar: höchstens einer, je einer, oder unbegrenzt.
- **Geisterfluch** (einstellbar): Gefallene dürfen einmal pro Partie eine Burg verfluchen.
- **Angreifer** (frei kombinierbar):
  - Katapult (eine Burg): die Mannschaft spannt, lädt und feuert.
  - Drache (alle Burgen auf seiner Flugbahn): landet danach und frisst eine Wache.
  - Pulverfass (eine Burg, 25 % Kettenreaktion): rollt über die Wiese an die Mauer.
  - Fluch (die Burg mit den meisten Türmen, durchbricht Schilde): eine Hexe auf dem Besen bringt ihn.
- **Lebendige Welt:**
  - Bauern, Kühe und Schafe laufen herum, fliehen panisch bei Angriffen und können auch getroffen werden. Leichen bleiben liegen.
  - Vogelschwärme, rauchende Kamine.
  - Burgen werden Stein für Stein gebaut.
  - Wachen patrouillieren, zielen bei Alarm und rennen panisch, wenn etwas einschlägt.
- **Kamera:** Kamerafahrten zwischen den Runden (kurz, filmisch oder filmisch mit Antippen zum Überspringen) und Killcam in Zeitlupe, wenn eine Burg fällt (abschaltbar).
- **Stechen:** Fallen alle übrigen Burgen gleichzeitig, stehen sie mit einem Turm wieder auf. Die letzten zwei spielen ein Finale mit Herzschlag.
- **Krönung:** Krone senkt sich auf den Burgherrn, Glocken, Fanfaren, Feuerwerk, Kamerafahrt. Einzelspiel oder Best of 3/5, dauerhafte Ruhmeshalle (localStorage), Pause und Abbruch.
- **Online-Modus:** Raum erstellen (Code + QR-Code) oder aus der öffentlichen Lobby beitreten. Jedes Handy zeigt die volle 3D-Ansicht. Boost, Schild und Geisterfluch wählt jeder geheim am eigenen Handy. Der Gastgeber-Browser rechnet das Spiel mit denselben Regeln und schickt jeden Schritt an alle. Wer kurz die Verbindung verliert, wird beim Wiederverbinden auf den aktuellen Stand gebracht.
- **Android-App:** `koenigsfinger.apk` (Download auf der Startseite) enthält alle drei Spiele zum Offline-Spielen. Online geht sie über den Cloudflare-Server. iPhone: einfach die Webseite nutzen („Zum Home-Bildschirm“).

Aufbau (`koenigsfinger/js/`): `rules.js` (reine Spielregeln, auch von den Tests geladen), `fate.js` (Zufallskern), `world.js`/`gl.js`/`shaders.js`/`meshes.js` (WebGL2-Engine: Schattenwurf, MSAA, Bloom, instanzierte Partikel und Trümmer, Blutflecken und Blut an den Mauern, Punktlichter), `life.js` (Bauern, Tiere, Krähen, Vögel, stürzende Wachen, Gliedmaßen, Leichen), `audio.js` (synthetisierte Musik je Spielphase und alle Geräusche), `herald.js` (Ansagen), `net.js` (Online-Verbindung), `main.js` (Ablauf und Oberfläche). Schriften liegen lokal in `koenigsfinger/fonts/` (SIL Open Font License), der QR-Code-Generator in `js/qrcode.mjs` (MIT).

**Fair:** Pro Partie ein frischer 128-Bit-Seed (sichtbar unten links). Angriffsart und Ziel der zufälligen Einschläge werden gleichverteilt gezogen. Nur der eigene Boost mit „Eigenes Ziel“ und der Geisterfluch treffen gezielt. Das Fadenkreuz springt erst wild, läuft dann im Kreis aus und hält genau auf dem vorab gezogenen Ziel. Mit demselben Seed ergibt sich dieselbe Partie.

### Android-App bauen

Ohne Gradle, nur mit JDK und den Android-Build-Tools (`build-tools` 35 und `platform` android-35 von dl.google.com):

```sh
SDK_BT=…/build-tools SDK_PLATFORM=…/platforms/android-35 ./android/build.sh
```

Das Skript packt Startseite und Spiele als Assets in eine WebView-App (`android/`) und signiert sie mit `android/koenigsfinger.keystore`. Den Schlüssel legt es beim ersten Bau lokal an; er liegt nicht im Repo. Damit neue Versionen über alte installiert werden können, muss derselbe Schlüssel weiterverwendet werden. Ergebnis: `koenigsfinger.apk` im Repo-Root.

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

Die Spiele laufen als Cloudflare Worker mit statischen Assets und wird über die Git-Integration (Workers Builds) deployt:

- Worker-Name: `auserw-hlte` (muss zu `name` in `wrangler.jsonc` passen)
- Production-Branch: `main`
- Build-Befehl: **leer** (kein Build-Befehl)
- Deploy-Befehl: `npx wrangler deploy`
- Ausgabeverzeichnis: der Repo-Root (`assets.directory: "."` in `wrangler.jsonc`)

Jeder Push auf `main` löst automatisch ein neues Deployment aus.

- `_headers` setzt `Cache-Control: no-cache` für alle Pfade, damit nach einem Deploy sofort die neue Version ausgeliefert wird.
- `.assetsignore` ist eine Positivliste: ausgeliefert werden nur die Startseite, die drei Spiel-Ordner und `koenigsfinger.apk`, nicht `.git`, `tests/`, `android/`, `README.md` oder die Konfiguration.
- `worker.js` ist das Worker-Skript für den Online-Modus von Königsfinger. Es bedient nur `/api/…`, alles andere sind statische Dateien. Räume und Lobby sind Durable Objects (`Room`, `Lobby`, SQLite-basiert, auch im Free-Plan). Die Migration steht in `wrangler.jsonc`.

Lokal mit Online-Modus: `npx wrangler dev`, dann http://localhost:8787 öffnen.

## Lokal testen

Der Auserwählte und Last Finger Standing lassen sich direkt als Datei im Browser öffnen. Königsfinger nutzt ES-Module und braucht deshalb einen beliebigen statischen Server im Repo-Root starten, z. B.:

```sh
python3 -m http.server 8000
```

## Wie fair ist die Auswahl?

(Der Auserwählte) Der Zufallskern steht in `auserwaehlt/index.html` im Block `<script id="fate">` und kommt ohne DOM aus:

1. Jede Runde holt einen frischen 128-Bit-Seed aus `crypto.getRandomValues` (Web Crypto) und mischt Zeit und Touch-Bewegungen dazu.
2. Daraus erzeugt der Pseudozufallsgenerator **sfc32** die Ziehung: Gewinner und Startpunkt der Markierung werden unabhängig voneinander gleichverteilt gezogen.
3. Die Markierung springt danach erst wild kreuz und quer zwischen den Fingern hin und her. Dann läuft sie ein bis zwei Runden im Uhrzeigersinn aus, wird immer langsamer und hält genau auf dem bereits gezogenen Gewinner. Der Weg ist reine Show: Er wird erst nach dem Gewinner aus demselben Seed erzeugt und beeinflusst das Ergebnis nicht.

## Tests

```sh
node --test
```

- `tests/fairness.test.mjs` prüft den echten Zufallskern aus `auserwaehlt/index.html` mit rund 1,8 Millionen simulierten Runden. Geprüft werden: Gleichverteilung für 2–12 Spieler, kein Vorteil durch Auflege-Reihenfolge oder Anordnung, Unabhängigkeit von Startpunkt und Vorrunde, eindeutige Seeds, sfc32 gegen eine Referenzimplementierung, der Fallback ohne Web Crypto und eine Gegenprobe, die eine absichtlich eingebaute Verzerrung von 2 % erkennt.
- `tests/lastfinger.test.mjs` und `tests/lastfinger.e2e.test.mjs` prüfen Last Finger Standing: Alle Ausscheide-Reihenfolgen sind gleich wahrscheinlich, der Sieger ist gleichverteilt und unabhängig vom Auflegen. Jede Bombe landet beim geplanten Opfer und springt nie zu Ausgeschiedenen. Dazu kommen komplette Spiele im Browser, auch mit der Ersatz-Grafik.
- `tests/koenigsfinger.test.mjs` prüft die Regeln von Königsfinger mit über 100 000 simulierten Partien und Runden. Getestet wird: fünf Türme, gleichverteilte Ziele und Angriffsarten, Reproduzierbarkeit per Seed, wer wählen darf, Schild hält genau einen Treffer und der Fluch durchbricht alle, die drei Stapel-Regeln, alle drei Boost-Arten (Extra-Einschlag trifft nie die eigene Burg und ist gleichverteilt), Geisterfluch nur einmal, Drachenbahn, Kettenquote, gleiche Siegchancen ohne Drachen, seltenes Stechen, Tempo und das Fadenkreuz endet am Ziel.
- `tests/koenigsfinger.e2e.test.mjs` spielt komplette Partien im Browser (Hoch- und Querformat). Gespielt wird mit verschiedenen Boost-Arten und Einstellungen. Geprüft wird, dass jeder Einschlag genau dort gezeigt wird, wo die Regeln ihn geplant haben, dass Getroffene wählen und dass die Krone beim Sieger landet. Mit `KF_ONLINE=http://localhost:8787` (laufendes `wrangler dev`) spielt er zusätzlich eine Online-Partie mit Gastgeber und zwei Gästen. Alle drei Handys müssen dasselbe Ergebnis zeigen.
- `tests/e2e.test.mjs` spielt komplette Runden in Chromium durch: Multitouch am Handy, Klicks am Desktop und die Ersatz-Grafik ohne WebGL. Er prüft, dass die sichtbare Markierung auf dem gezogenen Gewinner endet. Außerdem rendert er die Musik-Engine offline durch alle Spielphasen und prüft Lautstärke, Übersteuerung und die Stille vor der Entscheidung. Ohne installiertes [Playwright](https://playwright.dev) wird er übersprungen.

Benötigt wird nur Node.js ab Version 20.
