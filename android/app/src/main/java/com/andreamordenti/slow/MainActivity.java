package com.andreamordenti.slow;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
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

    // Login Google con permesso su Drive: Google risponde qui, lo giriamo al plugin.
    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle handle = getBridge().getPlugin("SocialLogin");
            if (handle == null) return;
            Plugin plugin = handle.getInstance();
            if (plugin instanceof SocialLoginPlugin) ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}

    private void takeRoute(Intent intent) {
        if (intent != null && intent.hasExtra(SlowWidgets.EXTRA_ROUTE)) pendingRoute = intent.getStringExtra(SlowWidgets.EXTRA_ROUTE);
    }
}
