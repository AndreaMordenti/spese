package com.andreamordenti.slow;

import android.content.ComponentName;
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
