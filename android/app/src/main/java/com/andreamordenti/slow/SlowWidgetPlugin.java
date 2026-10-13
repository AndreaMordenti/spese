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
