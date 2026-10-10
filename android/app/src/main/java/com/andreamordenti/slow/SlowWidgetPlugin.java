package com.andreamordenti.slow;

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

    // Restituisce (una volta sola) la schermata richiesta da un widget all'avvio a freddo.
    @PluginMethod
    public void consumeRoute(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("route", MainActivity.pendingRoute);
        MainActivity.pendingRoute = null;
        call.resolve(ret);
    }
}
