package com.harsitomiii.tvlauncher

/** Which apps the home screen shows. Everything else lives under "All apps". */
object Config {
    /** The two big tiles. */
    val heroApps = listOf(
        Tile("com.github.damontecres.wholphin", 0xFF3A2378, 0xFF14234F),
        Tile("com.google.android.youtube.tv", 0xFF3A3A3A, 0xFF141414, icon = R.drawable.ic_youtube),
    )

    /** Smaller tiles stacked beside the hero row, above the "All apps" tile. */
    val sideApps = listOf(
        Tile("com.valvesoftware.steamlink", 0xFF1E6FA0, 0xFF1C2A4E),
    )
}

/**
 * A home screen tile: a top-left to bottom-right gradient behind the app's icon and name.
 * [icon] replaces the app's own icon when that one isn't usable at tile size.
 */
class Tile(val packageName: String, startColor: Long, endColor: Long, val icon: Int? = null) {
    val colors = intArrayOf(startColor.toInt(), endColor.toInt())
}
