#!/usr/bin/env bash
set -euo pipefail

app_dir=$(cd "$(dirname "$0")/.." && pwd)
sdk=${ANDROID_HOME:?Configurá ANDROID_HOME con el SDK de Android}
tools="$sdk/build-tools/35.0.0"
platform="$sdk/platforms/android-35/android.jar"
output=${1:?Indicá la ruta de salida de la APK}
signing_dir=${FINANCE_PREVIEW_SIGNING_DIR:?Indicá un directorio privado para la firma de prueba}
mkdir -p "$signing_dir"
chmod 700 "$signing_dir"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work"/{res/drawable,assets/web,classes,dex}
cd "$app_dir"
VITE_ENABLE_SUPABASE=false npm run build
cp -R dist/. "$work/assets/web/"
cp public/icon-192.png "$work/res/drawable/wallet.png"
"$tools/aapt2" compile --dir "$work/res" -o "$work/resources.zip"
"$tools/aapt2" link -I "$platform" --manifest android-preview/AndroidManifest.xml \
  -A "$work/assets" -o "$work/unsigned.apk" "$work/resources.zip"
if command -v javac >/dev/null; then
  javac -source 8 -target 8 -Xlint:-options -cp "$platform" -d "$work/classes" android-preview/PreviewActivity.java
else
  java -jar "${FINANCE_PREVIEW_ECJ_JAR:?Instalá un JDK o indicá la ruta a ECJ}" -1.8 \
    -bootclasspath "$platform" -d "$work/classes" android-preview/PreviewActivity.java
fi
mapfile -t classes < <(find "$work/classes" -type f -name '*.class')
"$tools/d8" --lib "$platform" --min-api 23 --output "$work/dex" "${classes[@]}"
(cd "$work/dex" && zip -q "$work/unsigned.apk" classes.dex)
"$tools/zipalign" -p -f 4 "$work/unsigned.apk" "$work/aligned.apk"
if [[ ! -f "$signing_dir/preview.p12" ]]; then
  umask 077
  openssl rand -hex 24 > "$signing_dir/password"
  keytool -genkeypair -storetype PKCS12 -keystore "$signing_dir/preview.p12" \
    -storepass:file "$signing_dir/password" -alias preview -keyalg RSA -keysize 2048 \
    -validity 3650 -dname 'CN=Mis Finanzas Preview'
fi
mkdir -p "$(dirname "$output")"
"$tools/apksigner" sign --ks "$signing_dir/preview.p12" --ks-pass "file:$signing_dir/password" \
  --ks-key-alias preview --out "$output" "$work/aligned.apk"
"$tools/apksigner" verify --verbose "$output"
"$tools/aapt2" dump badging "$output" | sed -n '1,10p'
