package com.andreamordenti.slow;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import org.json.JSONArray;
import org.json.JSONObject;

// Legge le notifiche delle sole app di pagamento scelte e le mette in coda per Slow.
// Il testo resta sul telefono: l'app lo trasforma in "movimenti da confermare".
public class SlowNotificationListener extends NotificationListenerService {
    static final String PREFS = "slow_notif";
    static final String DEFAULT_APPS = "com.satispay.customer,com.google.android.apps.walletnfcrel,it.icbpi.mobile,com.vipera.chebanca,it.ing.banking,com.americanexpress.android.acctsvcs.it,com.revolut.revolut,com.paypal.android.p2pmobile,com.sella.BancaSella";
    private static final int MAX_QUEUE = 300;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String pkg = sbn.getPackageName();
            String apps = "," + prefs(this).getString("apps", DEFAULT_APPS) + ",";
            if (!apps.contains("," + pkg + ",")) return;
            Notification n = sbn.getNotification();
            if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return; // riepiloghi di gruppo: doppioni
            Bundle ex = n.extras;
            String title = str(ex.getCharSequence(Notification.EXTRA_TITLE));
            String text = str(ex.getCharSequence(Notification.EXTRA_TEXT));
            String big = str(ex.getCharSequence(Notification.EXTRA_BIG_TEXT));
            String sub = str(ex.getCharSequence(Notification.EXTRA_SUB_TEXT));
            if (title.isEmpty() && text.isEmpty() && big.isEmpty()) return;
            JSONObject o = new JSONObject();
            o.put("id", pkg + "|" + sbn.getPostTime() + "|" + (title + text).hashCode());
            o.put("pkg", pkg);
            o.put("time", sbn.getPostTime());
            o.put("title", title);
            o.put("text", big.isEmpty() ? text : big);
            o.put("sub", sub);
            synchronized (SlowNotificationListener.class) {
                JSONArray q = new JSONArray(prefs(this).getString("queue", "[]"));
                for (int i = 0; i < q.length(); i++) if (o.getString("id").equals(q.getJSONObject(i).optString("id"))) return;
                q.put(o);
                while (q.length() > MAX_QUEUE) q.remove(0);
                prefs(this).edit().putString("queue", q.toString()).apply();
            }
            if (looksLikePayment(title + " " + text + " " + big)) remind();
        } catch (Exception e) { /* una notifica illeggibile non deve fermare il servizio */ }
    }

    private static String str(CharSequence c) { return c == null ? "" : c.toString().trim(); }

    // Solo per decidere se avvisare: la lettura vera la fa l'app.
    private static boolean looksLikePayment(String s) { return s.matches("(?is).*(€|eur|euro)\\s?.*") && s.matches("(?is).*\\d+[.,]\\d{2}.*"); }

    // Avviso discreto: "Hai movimenti da confermare in Slow".
    private void remind() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel("slow_inbox") == null)
            nm.createNotificationChannel(new NotificationChannel("slow_inbox", "Movimenti da confermare", NotificationManager.IMPORTANCE_LOW));
        Intent i = new Intent(this, MainActivity.class).putExtra(SlowWidgets.EXTRA_ROUTE, "#inbox").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 10, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, "slow_inbox")
            .setSmallIcon(R.drawable.ic_stat_slow).setColor(0xFFD4FF5B)
            .setContentTitle("Nuovo pagamento letto").setContentText("Tocca per confermarlo in Slow")
            .setContentIntent(pi).setAutoCancel(true);
        nm.notify(7001, b.build());
    }
}
