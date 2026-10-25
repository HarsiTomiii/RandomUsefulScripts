package com.harsitomiii.tvlauncher

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private lateinit var heroRow: LinearLayout
    private lateinit var continueSection: View
    private lateinit var continueRow: LinearLayout

    private val jellyfinExecutor = Executors.newSingleThreadExecutor()
    private val imageExecutor = Executors.newFixedThreadPool(3)
    // What the row currently shows, so a refresh that changes nothing doesn't steal focus.
    private var shownItems: List<String> = emptyList()

    // Rebuild the tiles when one of the pinned apps is installed, updated or removed.
    private val packageReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = bindApps()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        heroRow = findViewById(R.id.hero_row)
        continueSection = findViewById(R.id.continue_section)
        continueRow = findViewById(R.id.continue_row)

        findViewById<TextView>(R.id.profile_button).setOnClickListener { Launch.profilePicker(this) }
        bindApps()

        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_CHANGED)
            addDataScheme("package")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(packageReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(packageReceiver, filter)
        }
    }

    // Coming back from Wholphin is the moment progress changes, so refresh on every resume.
    override fun onResume() {
        super.onResume()
        refreshContinueWatching()
    }

    override fun onDestroy() {
        unregisterReceiver(packageReceiver)
        jellyfinExecutor.shutdownNow()
        imageExecutor.shutdownNow()
        super.onDestroy()
    }

    // Pressing Home while already home jumps back to the first tile.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        Cards.firstCard(heroRow)?.requestFocus()
    }

    // There is nothing behind the home screen to go back to.
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean =
        keyCode == KeyEvent.KEYCODE_BACK || super.onKeyDown(keyCode, event)

    private fun bindApps() {
        heroRow.removeAllViews()
        for (tile in Config.heroApps) addTile(heroRow, CardSize.HERO, tile)

        val side = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            clipChildren = false
        }
        heroRow.addView(side, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { marginStart = (CardSize.HERO.gapDp * resources.displayMetrics.density).toInt() })
        for (tile in Config.sideApps) addTile(side, CardSize.SIDE, tile)

        val allApps = Cards.add(side, CardSize.SIDE)
        Cards.bindText(allApps, getString(R.string.all_apps))
        allApps.setOnClickListener { startActivity(Intent(this, AllAppsActivity::class.java)) }

        (Cards.firstCard(heroRow).takeIf { it !== side } ?: allApps).requestFocus()
    }

    private fun refreshContinueWatching() {
        if (!Jellyfin.isConfigured) return
        jellyfinExecutor.execute {
            val items = try {
                Jellyfin.continueWatching()
            } catch (e: Exception) {
                // Keep whatever is showing; the server may just be unreachable for a moment.
                Log.w("TvLauncher", "Continue watching failed", e)
                return@execute
            }
            runOnUiThread { if (!isDestroyed) bindContinueWatching(items) }
        }
    }

    private fun bindContinueWatching(items: List<MediaItem>) {
        val signature = items.map { "${it.id}:${it.positionMs}" }
        if (signature == shownItems) return
        shownItems = signature

        val hadFocus = continueRow.hasFocus()
        continueRow.removeAllViews()
        continueSection.visibility = if (items.isEmpty()) View.GONE else View.VISIBLE
        for (item in items) {
            val image = Cards.addMedia(continueRow, item) { Launch.media(this, item) }
            val url = item.imageUrl ?: continue
            imageExecutor.execute {
                val bitmap = Jellyfin.image(url) ?: return@execute
                runOnUiThread { image.setImageBitmap(bitmap) }
            }
        }
        if (hadFocus) Cards.firstCard(continueRow)?.findViewById<View>(R.id.card)?.requestFocus()
    }

    private fun addTile(parent: LinearLayout, size: CardSize, tile: Tile) {
        val app = Apps.find(packageManager, tile.packageName) ?: return
        val card = Cards.addTile(parent, size, tile, app)
        card.setOnClickListener { Launch.app(this, app) }
    }
}
