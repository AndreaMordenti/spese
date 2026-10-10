package com.andreamordenti.slow;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Schermata da aprire quando l'app parte da un widget o da una notifica (es. "#aggiungi").
    static String pendingRoute = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SlowWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        takeRoute(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        takeRoute(intent);
        // App già aperta: cambia schermata subito.
        if (pendingRoute != null && getBridge() != null) {
            String r = pendingRoute.replace("'", "");
            pendingRoute = null;
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript("location.hash='" + r + "'", null));
        }
    }

    // Autorizzazione Google per Drive: la risposta della schermata di Google torna qui.
    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == SlowWidgetPlugin.REQ_DRIVE_AUTH) SlowWidgetPlugin.onDriveAuthResult(this, data);
    }

    private void takeRoute(Intent intent) {
        if (intent != null && intent.hasExtra(SlowWidgets.EXTRA_ROUTE)) pendingRoute = intent.getStringExtra(SlowWidgets.EXTRA_ROUTE);
    }
}
