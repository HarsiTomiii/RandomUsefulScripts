package com.harsitomiii.tvlauncher

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.util.Log
import android.widget.Toast

object Launch {
    private const val TAG = "TvLauncher"
    const val GOOGLE_LAUNCHER = "com.google.android.apps.tv.launcherx"

    fun app(activity: Activity, app: AppEntry) {
        if (!tryStart(activity, app.intent)) toast(activity, R.string.cannot_open, app.label)
    }

    fun media(activity: Activity, item: MediaItem) {
        if (!tryStart(activity, Jellyfin.playIntent(item))) toast(activity, R.string.cannot_open, item.title)
    }

    /**
     * Opens Google TV's own profile chooser, which lives inside the stock launcher. Its intent
     * filter has no DEFAULT category, so it can only be started explicitly. It opens in the stock
     * launcher's task, so Back lands on the stock home screen, which [HomeKeyService] redirects here.
     */
    fun profilePicker(activity: Activity) {
        val intent = Intent().setClassName(GOOGLE_LAUNCHER, "$GOOGLE_LAUNCHER.profile.chooser.ProfileChooserActivity")
        if (!tryStart(activity, intent)) toast(activity, R.string.cannot_open, activity.getString(R.string.switch_profile))
    }

    private fun tryStart(activity: Activity, intent: Intent): Boolean =
        try {
            activity.startActivity(intent)
            true
        } catch (e: ActivityNotFoundException) {
            Log.w(TAG, "No activity for $intent", e)
            false
        } catch (e: SecurityException) {
            Log.w(TAG, "Not allowed to start $intent", e)
            false
        }

    private fun toast(activity: Activity, message: Int, arg: CharSequence) =
        Toast.makeText(activity, activity.getString(message, arg), Toast.LENGTH_SHORT).show()
}
