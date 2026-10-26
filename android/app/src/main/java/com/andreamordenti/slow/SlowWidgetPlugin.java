package com.andreamordenti.slow;

import android.app.Activity;
import android.content.ComponentName;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import java.util.Collections;
import android.content.Intent;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;
import android.Manifest;
import android.database.Cursor;
import android.net.Uri;

// Ponte tra l'app web e i widget: l'app manda i dati già formattati, i widget li mostrano.
@CapacitorPlugin(name = "SlowWidget", permissions = { @Permission(strings = { Manifest.permission.READ_SMS }, alias = "sms") })
public class SlowWidgetPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        String data = call.getString("data");
        if (data == null) { call.reject("Dati mancanti"); return; }
        SlowWidgets.save(getContext(), data);
        SlowWidgets.refreshAll(getContext());
        call.resolve();
    }

    // ---------- Google Drive: permesso sulla cartella privata dell'app ----------
    // Dopo il primo consenso Google restituisce un nuovo token in silenzio, senza schermate.
    static final int REQ_DRIVE_AUTH = 9101;
    private static PluginCall pendingAuth = null;

    @PluginMethod
    public void driveToken(PluginCall call) {
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", false));
        AuthorizationRequest req = AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope("https://www.googleapis.com/auth/drive.appdata"))).build();
        Identity.getAuthorizationClient(getActivity()).authorize(req)
            .addOnSuccessListener(res -> {
                if (!res.hasResolution()) { resolveToken(call, res); return; }
                if (!interactive) { call.reject("serve un tocco per confermare l'accesso a Google"); return; }
                try {
                    pendingAuth = call;
                    getActivity().startIntentSenderForResult(res.getPendingIntent().getIntentSender(), REQ_DRIVE_AUTH, null, 0, 0, 0);
                } catch (Exception e) { pendingAuth = null; call.reject("schermata Google non disponibile: " + e.getMessage()); }
            })
            .addOnFailureListener(e -> call.reject("autorizzazione Google non riuscita: " + e.getMessage()));
    }

    static void onDriveAuthResult(Activity activity, Intent data) {
        PluginCall call = pendingAuth; pendingAuth = null;
        if (call == null) return;
        try { resolveToken(call, Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data)); }
        catch (Exception e) { call.reject("accesso annullato"); }
    }

    private static void resolveToken(PluginCall call, AuthorizationResult res) {
        if (res.getAccessToken() == null) { call.reject("Google non ha concesso l'accesso a Drive"); return; }
        JSObject ret = new JSObject();
        ret.put("token", res.getAccessToken());
        call.resolve(ret);
    }

    // ---------- SMS delle banche ----------
    @PluginMethod
    public void smsAccess(PluginCall call) {
        JSObject ret = new JSObject(); ret.put("granted", getPermissionState("sms") == PermissionState.GRANTED); call.resolve(ret);
    }

    @PluginMethod
    public void requestSms(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) { smsAccess(call); return; }
        requestPermissionForAlias("sms", call, "smsPermCallback");
    }

    @PermissionCallback
    private void smsPermCallback(PluginCall call) { smsAccess(call); }

    // Legge solo gli SMS ricevuti dai mittenti indicati, dopo la data indicata.
    @PluginMethod
    public void readSms(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) { call.reject("permesso SMS non concesso"); return; }
        long since = call.getLong("since", 0L);
        String[] senders = call.getString("senders", "").split("\\|");
        JSArray out = new JSArray();
        StringBuilder where = new StringBuilder("date > ? AND (");
        String[] args = new String[senders.length + 1];
        args[0] = String.valueOf(since);
        for (int i = 0; i < senders.length; i++) { where.append(i > 0 ? " OR " : "").append("address = ?"); args[i + 1] = senders[i]; }
        where.append(")");
        try (Cursor c = getContext().getContentResolver().query(Uri.parse("content://sms/inbox"), new String[] { "address", "body", "date" }, where.toString(), args, "date ASC")) {
            while (c != null && c.moveToNext()) {
                JSObject o = new JSObject(); o.put("address", c.getString(0)); o.put("body", c.getString(1)); o.put("date", c.getLong(2)); out.put(o);
            }
        } catch (Exception e) { call.reject("lettura SMS non riuscita: " + e.getMessage()); return; }
        JSObject ret = new JSObject(); ret.put("items", out); call.resolve(ret);
    }

    // ---------- Uso del telefono (Diario) ----------
    private boolean usageGranted() {
        android.app.AppOpsManager ops = (android.app.AppOpsManager) getContext().getSystemService(android.content.Context.APP_OPS_SERVICE);
        int mode = ops.unsafeCheckOpNoThrow(android.app.AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), getContext().getPackageName());
        return mode == android.app.AppOpsManager.MODE_ALLOWED;
    }

    @PluginMethod
    public void usageAccess(PluginCall call) {
        JSObject ret = new JSObject(); ret.put("granted", usageGranted()); call.resolve(ret);
    }

    @PluginMethod
    public void openUsageAccess(PluginCall call) {
        getContext().startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        call.resolve();
    }

    // Per ogni giorno: minuti di schermo, sblocchi, primo sblocco, ultimo uso, minuti tra mezzanotte e le 5, app più usate.
    // Solo numeri e nomi delle app: nessun contenuto.
    @PluginMethod
    public void usageDays(PluginCall call) {
        if (!usageGranted()) { call.reject("accesso ai dati di utilizzo non concesso"); return; }
        int days = Math.max(1, Math.min(60, call.getInt("days", 14)));
        android.app.usage.UsageStatsManager um = (android.app.usage.UsageStatsManager) getContext().getSystemService(android.content.Context.USAGE_STATS_SERVICE);
        android.content.pm.PackageManager pm = getContext().getPackageManager();
        java.util.Set<String> skip = new java.util.HashSet<>();
        skip.add("com.android.systemui");
        for (android.content.pm.ResolveInfo r : pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0)) skip.add(r.activityInfo.packageName);
        java.util.Calendar cal = java.util.Calendar.getInstance();
        cal.set(java.util.Calendar.HOUR_OF_DAY, 0); cal.set(java.util.Calendar.MINUTE, 0); cal.set(java.util.Calendar.SECOND, 0); cal.set(java.util.Calendar.MILLISECOND, 0);
        cal.add(java.util.Calendar.DAY_OF_MONTH, -(days - 1));
        JSArray out = new JSArray();
        java.text.SimpleDateFormat iso = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.ROOT), hm = new java.text.SimpleDateFormat("HH:mm", java.util.Locale.ROOT);
        long now = System.currentTimeMillis();
        for (int d = 0; d < days; d++) {
            long start = cal.getTimeInMillis(); cal.add(java.util.Calendar.DAY_OF_MONTH, 1); long end = Math.min(cal.getTimeInMillis(), now), late = start + 5 * 3600_000L;
            if (start >= now) break;
            android.app.usage.UsageEvents ev = um.queryEvents(start, end);
            android.app.usage.UsageEvents.Event e = new android.app.usage.UsageEvents.Event();
            java.util.Map<String, long[]> apps = new java.util.HashMap<>(); // [ms, aperture]
            // Un'app conta come "aperta" solo se arrivi da un'altra app o dopo 30 secondi lontano:
            // i passaggi tra schermate della stessa app (chat, foto, tendina) non sono nuove aperture.
            String fg = null, prevPk = null; long fgAt = 0, prevEnd = 0, first = 0, last = 0, lateMs = 0; int unlocks = 0;
            while (ev.hasNextEvent()) {
                ev.getNextEvent(e);
                int t = e.getEventType(); long ts = e.getTimeStamp(); String pk = e.getPackageName();
                if (t == 18 /* KEYGUARD_HIDDEN */) { unlocks++; if (first == 0 && ts >= late) first = ts; }
                else if (t == android.app.usage.UsageEvents.Event.ACTIVITY_RESUMED) {
                    if (skip.contains(pk)) continue;
                    if (fg != null && !fg.equals(pk)) { long dur = ts - fgAt; apps.computeIfAbsent(fg, k -> new long[2])[0] += dur; if (fgAt < late) lateMs += Math.min(ts, late) - fgAt; }
                    if (fg != null && !fg.equals(pk)) { prevPk = fg; prevEnd = ts; }
                    if (fg == null || !fg.equals(pk)) { if (!(pk.equals(prevPk) && ts - prevEnd < 30_000)) apps.computeIfAbsent(pk, k -> new long[2])[1]++; fgAt = ts; fg = pk; }
                } else if ((t == android.app.usage.UsageEvents.Event.ACTIVITY_PAUSED && pk.equals(fg)) || t == 16 /* SCREEN_NON_INTERACTIVE */) {
                    if (fg != null) { apps.computeIfAbsent(fg, k -> new long[2])[0] += ts - fgAt; if (fgAt < late) lateMs += Math.min(ts, late) - fgAt; last = ts; prevPk = fg; prevEnd = ts; fg = null; }
                }
            }
            if (fg != null) { apps.computeIfAbsent(fg, k -> new long[2])[0] += end - fgAt; last = end; }
            long total = 0; for (long[] v : apps.values()) total += v[0];
            java.util.List<java.util.Map.Entry<String, long[]>> list = new java.util.ArrayList<>(apps.entrySet());
            list.sort((a, b) -> Long.compare(b.getValue()[0], a.getValue()[0]));
            JSArray top = new JSArray();
            for (int i = 0; i < Math.min(5, list.size()); i++) {
                java.util.Map.Entry<String, long[]> it = list.get(i); if (it.getValue()[0] < 60_000) break;
                String label = it.getKey(); try { label = pm.getApplicationLabel(pm.getApplicationInfo(it.getKey(), 0)).toString(); } catch (Exception ignored) {}
                JSObject a = new JSObject(); a.put("n", label); a.put("min", Math.round(it.getValue()[0] / 60000.0)); a.put("opens", it.getValue()[1]); top.put(a);
            }
            JSObject o = new JSObject();
            o.put("date", iso.format(new java.util.Date(start))); o.put("screenMin", Math.round(total / 60000.0)); o.put("unlocks", unlocks);
            o.put("first", first > 0 ? hm.format(new java.util.Date(first)) : ""); o.put("last", last > 0 ? hm.format(new java.util.Date(last)) : "");
            o.put("lateMin", Math.round(Math.max(0, lateMs) / 60000.0)); o.put("apps", top);
            out.put(o);
        }
        JSObject ret = new JSObject(); ret.put("items", out); call.resolve(ret);
    }

    // ---------- Lettura notifiche di pagamento ----------
    @PluginMethod
    public void notifAccess(PluginCall call) {
        String flat = Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
        String me = new ComponentName(getContext(), SlowNotificationListener.class).flattenToString();
        JSObject ret = new JSObject();
        ret.put("enabled", flat != null && flat.contains(me));
        ret.put("apps", SlowNotificationListener.prefs(getContext()).getString("apps", SlowNotificationListener.DEFAULT_APPS));
        call.resolve(ret);
    }

    @PluginMethod
    public void openNotifAccess(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void setNotifApps(PluginCall call) {
        SlowNotificationListener.prefs(getContext()).edit().putString("apps", call.getString("apps", "")).apply();
        call.resolve();
    }

    // Consegna all'app le notifiche lette e svuota la coda.
    @PluginMethod
    public void takeNotifications(PluginCall call) {
        String q;
        synchronized (SlowNotificationListener.class) {
            q = SlowNotificationListener.prefs(getContext()).getString("queue", "[]");
            SlowNotificationListener.prefs(getContext()).edit().putString("queue", "[]").apply();
        }
        JSObject ret = new JSObject();
        try { ret.put("items", new JSArray(q)); } catch (Exception e) { ret.put("items", new JSArray()); }
        call.resolve(ret);
    }

    // Spunte del diario fatte dal widget, da applicare nell'app.
    @PluginMethod
    public void takeDiaryToggles(PluginCall call) {
        android.content.SharedPreferences p = getContext().getSharedPreferences(SlowWidgets.PREFS, android.content.Context.MODE_PRIVATE);
        String q = p.getString("diaryQueue", "[]"); p.edit().putString("diaryQueue", "[]").apply();
        JSObject ret = new JSObject();
        try { ret.put("items", new JSArray(q)); } catch (Exception e) { ret.put("items", new JSArray()); }
        call.resolve(ret);
    }

    // Restituisce (una volta sola) la schermata richiesta da un widget all'avvio a freddo.
    @PluginMethod
    public void consumeRoute(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("route", MainActivity.pendingRoute);
        MainActivity.pendingRoute = null;
        call.resolve(ret);
    }
}
