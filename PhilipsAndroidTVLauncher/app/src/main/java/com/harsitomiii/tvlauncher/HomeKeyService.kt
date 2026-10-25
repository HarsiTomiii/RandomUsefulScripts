package com.harsitomiii.tvlauncher

import android.accessibilityservice.AccessibilityService
import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import android.view.ViewConfiguration
import android.view.accessibility.AccessibilityEvent

/**
 * Google TV ignores the HOME role, so the Home key and the stock home screen are redirected here
 * instead. A short press opens this launcher; holding Home still opens Google TV's side panel.
 * The stock launcher stays installed because the profile chooser and side panel live in it.
 */
class HomeKeyService : AccessibilityService() {
    private val handler = Handler(Looper.getMainLooper())
    private var longPressed = false
    private val longPress = Runnable {
        longPressed = true
        openDashboard()
    }

    override fun onKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode != KeyEvent.KEYCODE_HOME) return false
        when (event.action) {
            KeyEvent.ACTION_DOWN -> if (event.repeatCount == 0) {
                longPressed = false
                handler.postDelayed(longPress, ViewConfiguration.getLongPressTimeout().toLong())
            }
            KeyEvent.ACTION_UP -> {
                handler.removeCallbacks(longPress)
                if (!longPressed) goHome()
            }
        }
        return true
    }

    // Anything else that lands on the stock home screen (boot, an app exiting, leaving the
    // profile chooser) is sent on to this launcher.
    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
            event.packageName == Launch.GOOGLE_LAUNCHER &&
            event.className?.toString() in STOCK_HOME_ACTIVITIES
        ) {
            goHome()
        }
    }

    override fun onInterrupt() = Unit

    private fun goHome() =
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))

    /** The panel Google TV shows when Home is held: profiles, inputs, settings, notifications. */
    private fun openDashboard() =
        try {
            startActivity(
                Intent("android.app.action.TOGGLE_NOTIFICATION_HANDLER_PANEL")
                    .setPackage(Launch.GOOGLE_LAUNCHER)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        } catch (e: ActivityNotFoundException) {
            Log.w("TvLauncher", "Google TV side panel not available", e)
        } catch (e: SecurityException) {
            Log.w("TvLauncher", "Not allowed to open the Google TV side panel", e)
        }

    private companion object {
        val STOCK_HOME_ACTIVITIES = setOf(
            "${Launch.GOOGLE_LAUNCHER}.home.HomeActivity",
            "${Launch.GOOGLE_LAUNCHER}.home.VanillaModeHomeActivity",
        )
    }
}
