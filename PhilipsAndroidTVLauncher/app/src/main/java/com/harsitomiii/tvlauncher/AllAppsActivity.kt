package com.harsitomiii.tvlauncher

import android.app.Activity
import android.os.Bundle
import android.widget.LinearLayout
import kotlin.concurrent.thread
import kotlin.math.roundToInt

class AllAppsActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_all_apps)
        val grid = findViewById<LinearLayout>(R.id.grid)

        // Loading every banner takes a moment; keep it off the main thread.
        thread {
            val apps = Apps.all(packageManager, packageName)
            runOnUiThread { if (!isDestroyed) bind(grid, apps) }
        }
    }

    private fun bind(grid: LinearLayout, apps: List<AppEntry>) {
        val rowGap = (ROW_GAP_DP * resources.displayMetrics.density).roundToInt()
        var firstRow: LinearLayout? = null
        for (rowApps in apps.chunked(COLUMNS)) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                clipChildren = false
            }
            grid.addView(row, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { bottomMargin = rowGap })
            for (app in rowApps) {
                val card = Cards.add(row, CardSize.GRID)
                Cards.bindApp(card, app)
                card.setOnClickListener { Launch.app(this, app) }
            }
            if (firstRow == null) firstRow = row
        }
        firstRow?.let { Cards.firstCard(it)?.requestFocus() }
    }

    private companion object {
        // 5 x 160dp tiles + 4 x 16dp gaps fill the 864dp content width exactly.
        const val COLUMNS = 5
        const val ROW_GAP_DP = 16
    }
}
