#!/usr/bin/env bash
# Baut die Android-App (APK) ohne Gradle: aapt2 → javac → d8 → zipalign → apksigner.
# Benötigt: JDK 17+, Android build-tools (35) und platform android-35. Pfade über SDK_BT und SDK_PLATFORM.
#   SDK_BT=…/android-15 SDK_PLATFORM=…/android-35 ./android/build.sh
set -euo pipefail
cd "$(dirname "$0")"
BT=${SDK_BT:?Pfad zu den build-tools}; JAR=${SDK_PLATFORM:?Pfad zur Plattform}/android.jar
OUT=build; rm -rf $OUT; mkdir -p $OUT/assets/www $OUT/classes $OUT/res
# Spiele als Assets: Startseite und alle Spiel-Ordner (ohne Testseiten)
cp ../index.html $OUT/assets/www/
for d in auserwaehlt lastfinger koenigsfinger; do cp -r ../$d $OUT/assets/www/; done
rm -f $OUT/assets/www/koenigsfinger/_t.html
"$BT/aapt2" compile --dir res -o $OUT/res.zip
"$BT/aapt2" link -o $OUT/base.apk -I "$JAR" --manifest AndroidManifest.xml -A $OUT/assets $OUT/res.zip --min-sdk-version 24 --target-sdk-version 35
javac -source 17 -target 17 -nowarn -classpath "$JAR" -d $OUT/classes $(find src -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$JAR" --output $OUT $(find $OUT/classes -name '*.class')
(cd $OUT && zip -q base.apk classes.dex)
"$BT/zipalign" -f -p 4 $OUT/base.apk $OUT/aligned.apk
# Signaturschlüssel: wird beim ersten Bau lokal angelegt (nicht im Repo). Für Updates über eine installierte Version denselben Schlüssel weiterverwenden.
[ -f koenigsfinger.keystore ] || keytool -genkeypair -keystore koenigsfinger.keystore -storepass koenigsfinger -keypass koenigsfinger -alias koenigsfinger -keyalg RSA -keysize 2048 -validity 20000 -dname "CN=Koenigsfinger, O=Fingerspiele, C=AT"
"$BT/apksigner" sign --ks koenigsfinger.keystore --ks-pass pass:koenigsfinger --key-pass pass:koenigsfinger --out ../koenigsfinger.apk $OUT/aligned.apk
"$BT/apksigner" verify ../koenigsfinger.apk && ls -la ../koenigsfinger.apk
