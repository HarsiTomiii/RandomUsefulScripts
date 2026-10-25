package com.harsitomiii.tvlauncher

import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.graphics.drawable.AdaptiveIconDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.InsetDrawable
import android.util.DisplayMetrics
import android.util.Log

class AppEntry(
    val packageName: String,
    val label: CharSequence,
    val banner: Drawable?,
    val icon: Drawable,
    val intent: Intent,
)

/** Looks up apps that declare a TV launcher activity. */
object Apps {
    fun find(pm: PackageManager, packageName: String): AppEntry? =
        query(pm, leanbackIntent().setPackage(packageName)).firstOrNull()?.let { toEntry(pm, it) }

    fun all(pm: PackageManager, excludePackage: String): List<AppEntry> =
        query(pm, leanbackIntent())
            .filter { it.activityInfo.packageName != excludePackage }
            .map { toEntry(pm, it) }
            .sortedBy { it.label.toString().lowercase() }

    @Suppress("DEPRECATION")
    private fun query(pm: PackageManager, intent: Intent): List<ResolveInfo> =
        pm.queryIntentActivities(intent, 0)

    private fun leanbackIntent() =
        Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER)

    private fun toEntry(pm: PackageManager, info: ResolveInfo): AppEntry {
        val activity = info.activityInfo
        return AppEntry(
            packageName = activity.packageName,
            label = info.loadLabel(pm),
            // Falls back to the application banner when the activity has none.
            banner = activity.loadBanner(pm),
            icon = hiResIcon(pm, activity) ?: info.loadIcon(pm),
            intent = leanbackIntent()
                .setClassName(activity.packageName, activity.name)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED),
        )
    }

    /**
     * The icon at xxxhdpi instead of the screen density, so it stays sharp on big tiles. For
     * adaptive icons only the foreground is used, enlarged so its 72/108 safe zone fills the view.
     */
    private fun hiResIcon(pm: PackageManager, activity: ActivityInfo): Drawable? =
        try {
            val res = pm.getResourcesForApplication(activity.applicationInfo)
            when (val icon = res.getDrawableForDensity(activity.iconResource, DisplayMetrics.DENSITY_XXXHIGH, null)) {
                is AdaptiveIconDrawable -> icon.foreground?.let { InsetDrawable(it, -0.25f) }
                else -> icon
            }
        } catch (e: Exception) {
            Log.w("TvLauncher", "No hi-res icon for ${activity.packageName}", e)
            null
        }
}
