package com.andreamordenti.slow;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

// Widget della home. I testi arrivano già pronti dall'app (SlowWidgetPlugin.update).
public abstract class SlowWidgets extends AppWidgetProvider {
    static final String EXTRA_ROUTE = "slow_route";
    static final String PREFS = "slow_widget";

    static void save(Context ctx, String json) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("data", json).apply();
    }

    static JSONObject load(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try { return new JSONObject(p.getString("data", "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    static void refreshAll(Context ctx) {
        Class<?>[] all = { MonthWidget.class, UpcomingWidget.class, PortfolioWidget.class, QuickAddWidget.class, TodayWidget.class, PaceWidget.class, DiaryWidget.class, InboxWidget.class };
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        for (Class<?> c : all) {
            int[] ids = m.getAppWidgetIds(new ComponentName(ctx, c));
            if (ids.length == 0) continue;
            Intent i = new Intent(ctx, c).setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE).putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            ctx.sendBroadcast(i);
        }
    }

    static PendingIntent open(Context ctx, String route, int code) {
        Intent i = new Intent(ctx, MainActivity.class).putExtra(EXTRA_ROUTE, route).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    abstract RemoteViews build(Context ctx, JSONObject d);

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        JSONObject d = load(ctx);
        for (int id : ids) m.updateAppWidget(id, build(ctx, d));
    }

    // Speso del mese rispetto al budget.
    public static class MonthWidget extends SlowWidgets {
        RemoteViews build(Context ctx, JSONObject d) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_month);
            JSONObject m = d.optJSONObject("month");
            v.setTextViewText(R.id.w_title, m != null ? m.optString("label", "Questo mese") : "Questo mese");
            v.setTextViewText(R.id.w_value, m != null ? m.optString("spent", "–") : "Apri Slow");
            v.setTextViewText(R.id.w_sub, m != null ? m.optString("sub", "") : "");
            v.setProgressBar(R.id.w_bar, 100, m != null ? Math.min(100, m.optInt("pct", 0)) : 0, false);
            v.setOnClickPendingIntent(R.id.w_root, open(ctx, "#home", 1));
            return v;
        }
    }

    // Prossime tre scadenze dei pagamenti pianificati.
    public static class UpcomingWidget extends SlowWidgets {
        RemoteViews build(Context ctx, JSONObject d) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_upcoming);
            JSONArray a = d.optJSONArray("upcoming");
            int[][] rows = { { R.id.w_n1, R.id.w_a1 }, { R.id.w_n2, R.id.w_a2 }, { R.id.w_n3, R.id.w_a3 } };
            for (int i = 0; i < rows.length; i++) {
                JSONObject r = a != null ? a.optJSONObject(i) : null;
                v.setTextViewText(rows[i][0], r != null ? r.optString("label", "") : (i == 0 ? "Nessuna scadenza" : ""));
                v.setTextViewText(rows[i][1], r != null ? r.optString("amount", "") : "");
            }
            v.setOnClickPendingIntent(R.id.w_root, open(ctx, "#pianificati", 2));
            return v;
        }
    }

    // Valore del portafoglio e variazione.
    public static class PortfolioWidget extends SlowWidgets {
        RemoteViews build(Context ctx, JSONObject d) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_portfolio);
            JSONObject p = d.optJSONObject("portfolio");
            v.setTextViewText(R.id.w_value, p != null ? p.optString("value", "–") : "Apri Slow");
            v.setTextViewText(R.id.w_sub, p != null ? p.optString("gain", "") : "");
            v.setTextViewText(R.id.w_day, p != null ? (p.optString("day", "") + (p.optString("balance", "").isEmpty() ? "" : "\n" + p.optString("balance"))) : "");
            v.setOnClickPendingIntent(R.id.w_root, open(ctx, "#portafoglio", 3));
            return v;
        }
    }

    // Un tocco: nuova spesa.
    public static class QuickAddWidget extends SlowWidgets {
        RemoteViews build(Context ctx, JSONObject d) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_add);
            v.setOnClickPendingIntent(R.id.w_root, open(ctx, "#aggiungi", 4));
            return v;
        }
    }

    // Quanto puoi spendere oggi per restare nel budget.
    public static class TodayWidget extends SlowWidgets {
        RemoteViews build(Context ctx, JSONObject d) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_today);
            JSONObject t = d.optJSONObject("today");
            v.setTextViewText(R.id.w_title, t != null ? t.optString("title", "Oggi") : "Oggi");
            v.setTextViewText(R.id.w_value, t != null ? t.optString("value", "–") : "Apri Slow");
            v.setTextColor(R.id.w_value, t != null && t.optBoolean("over") ? 0xFFFFB36B : 0xFFD4FF5B);
            v.setTextViewText(R.id.w_sub, t != null ? t.optString("sub", "") : "");
            v.setOnClickPendingIntent(R.id.w_root, open(ctx, "#home", 5));
            return v;
        }
    }

    // Grafico: spesa cumulata del mese contro il mese scorso e il budget (immagine disegnata dall'app).
    public static class PaceWidget extends SlowWidgets {
        RemoteViews build(Context ctx, JSONObject d) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_pace);
            JSONObject p = d.optJSONObject("pace");
            v.setTextViewText(R.id.w_title, p != null ? p.optString("title", "Ritmo del mese") : "Ritmo del mese");
            v.setTextViewText(R.id.w_sub, p != null ? p.optString("sub", "") : "Apri Slow");
            try {
                String img = p != null ? p.optString("img", "") : "";
                if (!img.isEmpty()) { byte[] b = Base64.decode(img, Base64.DEFAULT); Bitmap bm = BitmapFactory.decodeByteArray(b, 0, b.length); if (bm != null) v.setImageViewBitmap(R.id.w_img, bm); }
            } catch (Exception e) { /* grafico non disponibile: restano i testi */ }
            v.setOnClickPendingIntent(R.id.w_root, open(ctx, "#analisi", 6));
            return v;
        }
    }

    // Segna attività: pulsanti con le attività del diario. Un tocco la registra per oggi, senza aprire l'app.
    // Il pulsante diventa subito ✓; l'app salva la registrazione (e la manda su Drive) alla prossima apertura.
    static final String ACTION_DIARY = "com.andreamordenti.slow.DIARY_LOG";
    public static class DiaryWidget extends SlowWidgets {
        RemoteViews build(Context ctx, JSONObject d) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_diary);
            JSONArray a = d.optJSONArray("diary");
            int[] btns = { R.id.w_b1, R.id.w_b2, R.id.w_b3, R.id.w_b4, R.id.w_b5, R.id.w_b6 };
            for (int i = 0; i < btns.length; i++) {
                JSONObject r = a != null ? a.optJSONObject(i) : null;
                v.setViewVisibility(btns[i], r != null ? android.view.View.VISIBLE : android.view.View.INVISIBLE);
                if (r == null) continue;
                boolean done = r.optBoolean("done");
                v.setTextViewText(btns[i], (done ? "✓ " : "+ ") + r.optString("name", ""));
                v.setTextColor(btns[i], done ? 0xFF0D0E12 : 0xFFF3F4F6);
                v.setInt(btns[i], "setBackgroundResource", done ? R.drawable.widget_btn_on : R.drawable.widget_btn);
                Intent t = new Intent(ctx, DiaryWidget.class).setAction(ACTION_DIARY).putExtra("id", r.optString("id"));
                v.setOnClickPendingIntent(btns[i], PendingIntent.getBroadcast(ctx, 100 + i, t, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            }
            v.setOnClickPendingIntent(R.id.w_title, open(ctx, "#diario", 7));
            return v;
        }

        @Override
        public void onReceive(Context ctx, Intent intent) {
            if (!ACTION_DIARY.equals(intent.getAction())) { super.onReceive(ctx, intent); return; }
            String id = intent.getStringExtra("id");
            try {
                JSONObject d = load(ctx); JSONArray a = d.optJSONArray("diary");
                for (int i = 0; a != null && i < a.length(); i++) { JSONObject r = a.getJSONObject(i); if (id.equals(r.optString("id"))) { if (r.optBoolean("done")) return; r.put("done", true); } }
                save(ctx, d.toString());
                String day = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.ITALY).format(new java.util.Date());
                SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                JSONArray q = new JSONArray(p.getString("diaryQueue", "[]"));
                q.put(new JSONObject().put("id", id).put("date", day).put("done", true).put("at", System.currentTimeMillis()));
                p.edit().putString("diaryQueue", q.toString()).apply();
                refreshAll(ctx);
            } catch (Exception e) { /* tocco ignorato se i dati non sono leggibili */ }
        }
    }

    // Pagamenti letti da notifiche e SMS in attesa di conferma.
    public static class InboxWidget extends SlowWidgets {
        RemoteViews build(Context ctx, JSONObject d) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_inbox);
            JSONObject b = d.optJSONObject("inbox");
            v.setTextViewText(R.id.w_value, b != null ? b.optString("count", "0") : "0");
            v.setTextViewText(R.id.w_sub, b != null ? b.optString("sub", "") : "Niente da confermare");
            v.setOnClickPendingIntent(R.id.w_root, open(ctx, "#inbox", 8));
            return v;
        }
    }
}
