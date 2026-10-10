#!/bin/sh
# Compila Slow e la installa sul Pixel: via cavo se collegato, altrimenti via Wi-Fi (debug wireless).
set -e
ADB="$HOME/Library/Android/sdk/platform-tools/adb"
cd "$(dirname "$0")/.."
npm run apk
if ! "$ADB" devices | grep -q "device$"; then
  # Cerca il telefono in rete: la porta del debug wireless cambia a ogni riattivazione.
  ADDR=$("$ADB" mdns services | awk '/_adb-tls-connect/ {print $3; exit}')
  [ -n "$ADDR" ] && "$ADB" connect "$ADDR"
fi
# Se il telefono è collegato sia via cavo sia via Wi-Fi, ne basta uno.
SERIAL=$("$ADB" devices | awk 'NR>1 && $2=="device" {print $1; exit}')
[ -n "$SERIAL" ] || { echo "Pixel non trovato: collegalo col cavo o attiva Debug wireless (stessa rete Wi-Fi del Mac)."; exit 1; }
"$ADB" -s "$SERIAL" install -r android/app/build/outputs/apk/debug/app-debug.apk
echo "Slow aggiornata sul telefono."
