package com.harsitomiii.tvlauncher

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private lateinit var scroll: ScrollView
    private lateinit var heroRow: LinearLayout
    private lateinit var continueWatching: MediaRow
    private lateinit var recommended: MediaRow

    private val jellyfinExecutor = Executors.newSingleThreadExecutor()
    private val imageExecutor = Executors.newFixedThreadPool(3)
    // Random picks stay put while browsing and are reshuffled after a while.
    private var recommendedLoadedAt = 0L

    // Rebuild the tiles when one of the pinned apps is installed, updated or removed.
    private val packageReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = bindApps()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        scroll = findViewById(R.id.scroll)
        heroRow = findViewById(R.id.hero_row)
        continueWatching = MediaRow(R.id.continue_section, R.string.continue_watching, Jellyfin::playIntent)
        recommended = MediaRow(R.id.recommended_section, R.string.recommended_movies, Jellyfin::detailsIntent)

        findViewById<TextView>(R.id.profile_button).setOnClickListener { Launch.profilePicker(this) }
        bindApps()
        scroll.viewTreeObserver.addOnGlobalFocusChangeListener { _, focused -> scrollToShow(focused) }

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
        refreshJellyfin()
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

    private fun addTile(parent: LinearLayout, size: CardSize, tile: Tile) {
        val app = Apps.find(packageManager, tile.packageName) ?: return
        val card = Cards.addTile(parent, size, tile, app)
        card.setOnClickListener { Launch.app(this, app) }
    }

    private fun refreshJellyfin() {
        if (!Jellyfin.isConfigured) return
        val reshuffle = recommendedLoadedAt == 0L ||
            SystemClock.elapsedRealtime() - recommendedLoadedAt > RESHUFFLE_AFTER_MS
        jellyfinExecutor.execute {
            continueWatching.load(Jellyfin::continueWatching)
            if (reshuffle && recommended.load(Jellyfin::randomMovies)) {
                runOnUiThread { recommendedLoadedAt = SystemClock.elapsedRealtime() }
            }
        }
    }

    /** Top rows scroll the page back to the top; lower rows scroll until the whole row is visible. */
    private fun scrollToShow(focused: View?) {
        val section = listOf(continueWatching, recommended).firstOrNull { it.contains(focused) }?.section
        val content = scroll.getChildAt(0)
        val target = if (section == null) 0 else section.bottom + content.paddingBottom - scroll.height
        scroll.smoothScrollTo(0, target.coerceAtLeast(0))
    }

    /** One titled row of Jellyfin items; [open] decides what selecting an item does in Wholphin. */
    private inner class MediaRow(sectionId: Int, title: Int, private val open: (MediaItem) -> Intent) {
        val section: View = findViewById(sectionId)
        private val items: LinearLayout = section.findViewById(R.id.row_items)
        // What the row currently shows, so a refresh that changes nothing doesn't steal focus.
        private var shown: List<String> = emptyList()

        init {
            section.findViewById<TextView>(R.id.row_title).setText(title)
        }

        fun contains(view: View?): Boolean {
            var v = view
            while (v != null) {
                if (v === section) return true
                v = v.parent as? View
            }
            return false
        }

        /** Runs [fetch] on the calling (background) thread and shows the result. False on failure. */
        fun load(fetch: () -> List<MediaItem>): Boolean {
            val result = try {
                fetch()
            } catch (e: Exception) {
                // Keep whatever is showing; the server may just be unreachable for a moment.
                Log.w("TvLauncher", "Jellyfin row failed", e)
                return false
            }
            runOnUiThread { if (!isDestroyed) bind(result) }
            return true
        }

        private fun bind(result: List<MediaItem>) {
            val signature = result.map { "${it.id}:${it.positionMs}" }
            if (signature == shown) return
            shown = signature

            val hadFocus = items.hasFocus()
            items.removeAllViews()
            section.visibility = if (result.isEmpty()) View.GONE else View.VISIBLE
            for (item in result) {
                val image = Cards.addMedia(items, item) { Launch.media(this@MainActivity, open(item), item) }
                val url = item.imageUrl ?: continue
                imageExecutor.execute {
                    val bitmap = Jellyfin.image(url) ?: return@execute
                    runOnUiThread { image.setImageBitmap(bitmap) }
                }
            }
            if (hadFocus) Cards.firstCard(items)?.findViewById<View>(R.id.card)?.requestFocus()
        }
    }

    private companion object {
        const val RESHUFFLE_AFTER_MS = 60 * 60 * 1000L
    }
}
