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
# La porta del debug wireless cambia spesso e non sempre si annuncia in rete: la cerco sull'ultimo indirizzo noto.
IPFILE="$HOME/.slow/phone-ip"
if ! "$ADB" devices | grep -q "device$" && [ -f "$IPFILE" ]; then
  IP=$(cat "$IPFILE"); echo "Cerco il debug wireless su $IP…"
  for P in $(python3 -c "
import asyncio,sys
async def t(p,s,f):
    async with s:
        try:
            r,w=await asyncio.wait_for(asyncio.open_connection('$IP',p),0.4); f.append(p); w.close()
        except Exception: pass
async def m():
    s=asyncio.Semaphore(800); f=[]; await asyncio.gather(*(t(p,s,f) for p in range(30000,50000))); print(' '.join(map(str,sorted(f))))
asyncio.run(m())"); do "$ADB" connect "$IP:$P" >/dev/null 2>&1; "$ADB" devices | grep -q "$IP:$P	device" && break; done
fi
# Se il telefono è collegato sia via cavo sia via Wi-Fi, ne basta uno.
SERIAL=$("$ADB" devices | awk 'NR>1 && $2=="device" {print $1; exit}')
case "$SERIAL" in *:*) mkdir -p "$HOME/.slow" && echo "${SERIAL%%:*}" > "$IPFILE";; esac
[ -n "$SERIAL" ] || { echo "Pixel non trovato: collegalo col cavo o attiva Debug wireless (stessa rete Wi-Fi del Mac)."; exit 1; }
"$ADB" -s "$SERIAL" install -r android/app/build/outputs/apk/debug/app-debug.apk
echo "Slow aggiornata sul telefono."
