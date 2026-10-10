package com.andreamordenti.slow;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

// Widget della home. I testi arrivano già pronti dall'app (SlowWidgetPlugin.update).
public abstract class SlowWidgets extends AppWidgetProvider {
    static final String EXTRA_ROUTE = "slow_route";
    private static final String PREFS = "slow_widget";

    static void save(Context ctx, String json) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("data", json).apply();
    }

    static JSONObject load(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try { return new JSONObject(p.getString("data", "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    static void refreshAll(Context ctx) {
        Class<?>[] all = { MonthWidget.class, UpcomingWidget.class, PortfolioWidget.class, QuickAddWidget.class };
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
            v.setTextViewText(R.id.w_day, p != null ? p.optString("day", "") : "");
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
}
