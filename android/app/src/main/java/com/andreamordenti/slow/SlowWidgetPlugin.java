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

// Ponte tra l'app web e i widget: l'app manda i dati già formattati, i widget li mostrano.
@CapacitorPlugin(name = "SlowWidget")
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

    // Restituisce (una volta sola) la schermata richiesta da un widget all'avvio a freddo.
    @PluginMethod
    public void consumeRoute(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("route", MainActivity.pendingRoute);
        MainActivity.pendingRoute = null;
        call.resolve(ret);
    }
}
