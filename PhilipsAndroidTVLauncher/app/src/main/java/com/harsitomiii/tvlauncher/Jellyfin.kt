package com.harsitomiii.tvlauncher

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import android.util.LruCache
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class MediaItem(
    val id: String,
    val title: String,
    val subtitle: String,
    val imageUrl: String?,
    /** 0..1, or 0 when the item hasn't been started. */
    val progress: Float,
    val positionMs: Long,
)

/**
 * Minimal Jellyfin client for the home screen rows: what the configured user is partway through
 * (plus the next episode of shows they're following), and a random pick of unwatched movies.
 * All calls block, so run them off the main thread.
 */
object Jellyfin {
    private const val TAG = "TvLauncher"
    private const val WHOLPHIN = "com.github.damontecres.wholphin"
    private const val TICKS_PER_MS = 10_000L
    private const val MAX_ITEMS = 12
    private const val IMAGE_WIDTH_PX = 384

    private val baseUrl = BuildConfig.JELLYFIN_URL.trimEnd('/')
    val isConfigured = baseUrl.isNotEmpty() && BuildConfig.JELLYFIN_API_KEY.isNotEmpty() &&
        BuildConfig.JELLYFIN_USER.isNotEmpty()

    // Looked up once per process; Wholphin needs both to open the item as the right user.
    @Volatile private var serverId: String? = null
    @Volatile private var userId: String? = null

    // Enough for both rows.
    private val images = LruCache<String, Bitmap>(2 * MAX_ITEMS + 8)

    fun continueWatching(): List<MediaItem> {
        val query = baseQuery()
        val resume = items(get("/UserItems/Resume?$query&MediaTypes=Video"))
        val nextUp = items(get("/Shows/NextUp?$query&EnableResumable=false"))
        // Skip "next up" for a show that already has an episode in progress.
        val inProgress = resume.mapNotNull { it.optString("SeriesId").ifEmpty { null } }.toSet()
        return (resume + nextUp.filter { it.optString("SeriesId") !in inProgress })
            .take(MAX_ITEMS)
            .map(::toMediaItem)
    }

    fun randomMovies(): List<MediaItem> =
        items(get("/Items?${baseQuery()}&IncludeItemTypes=Movie&Recursive=true&IsPlayed=false&SortBy=Random"))
            .map(::toMediaItem)

    fun image(url: String): Bitmap? =
        images.get(url) ?: try {
            open(url).inputStream.use(BitmapFactory::decodeStream)?.also { images.put(url, it) }
        } catch (e: Exception) {
            Log.w(TAG, "Image failed: $url", e)
            null
        }

    /** Starts playback in Wholphin, resuming where the user left off, signed in as the configured user. */
    fun playIntent(item: MediaItem): Intent =
        wholphinIntent("$WHOLPHIN.PLAYBACK", item).putExtra("position", item.positionMs)

    /** Opens the item's detail page in Wholphin. */
    fun detailsIntent(item: MediaItem): Intent = wholphinIntent(Intent.ACTION_VIEW, item)

    private fun wholphinIntent(action: String, item: MediaItem) =
        Intent(action)
            .setClassName(WHOLPHIN, "$WHOLPHIN.MainActivity")
            .putExtra("itemId", item.id)
            .putExtra("serverId", serverId)
            .putExtra("userId", userId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    /** Common query parameters; also looks up the user and server IDs on first use. */
    private fun baseQuery(): String {
        val user = userId ?: findUserId().also { userId = it }
        if (serverId == null) serverId = get("/System/Info/Public").let(::JSONObject).getString("Id")
        return "userId=$user&Limit=$MAX_ITEMS&EnableImageTypes=Primary,Thumb,Backdrop&ImageTypeLimit=1"
    }

    private fun findUserId(): String {
        val users = JSONArray(get("/Users"))
        for (i in 0 until users.length()) {
            val user = users.getJSONObject(i)
            if (user.getString("Name").equals(BuildConfig.JELLYFIN_USER, ignoreCase = true)) return user.getString("Id")
        }
        error("Jellyfin user ${BuildConfig.JELLYFIN_USER} not found")
    }

    private fun items(json: String): List<JSONObject> {
        val items = JSONObject(json).getJSONArray("Items")
        return (0 until items.length()).map(items::getJSONObject)
    }

    private fun toMediaItem(item: JSONObject): MediaItem {
        val userData = item.optJSONObject("UserData")
        val isEpisode = item.optString("Type") == "Episode"
        val subtitle = if (isEpisode) {
            "S${item.optInt("ParentIndexNumber")}:E${item.optInt("IndexNumber")} · ${item.optString("Name")}"
        } else {
            movieDetails(item)
        }
        return MediaItem(
            id = item.getString("Id"),
            title = if (isEpisode) item.optString("SeriesName") else item.optString("Name"),
            subtitle = subtitle,
            imageUrl = imageUrl(item, isEpisode),
            progress = ((userData?.optDouble("PlayedPercentage", 0.0) ?: 0.0) / 100).toFloat(),
            positionMs = (userData?.optLong("PlaybackPositionTicks") ?: 0L) / TICKS_PER_MS,
        )
    }

    /** "2015 · 2h 1m · ★ 7.4", leaving out whatever the server doesn't know. */
    private fun movieDetails(item: JSONObject): String {
        val minutes = item.optLong("RunTimeTicks") / TICKS_PER_MS / 60_000
        val rating = item.optDouble("CommunityRating")
        return listOfNotNull(
            item.optInt("ProductionYear").takeIf { it > 0 }?.toString(),
            minutes.takeIf { it > 0 }?.let { if (it >= 60) "${it / 60}h ${it % 60}m" else "${it}m" },
            rating.takeIf { !it.isNaN() }?.let { "★ %.1f".format(it) },
        ).joinToString(" · ")
    }

    /** A 16:9 image: the show's thumb for episodes, otherwise the item's own thumb or backdrop. */
    private fun imageUrl(item: JSONObject, isEpisode: Boolean): String? {
        val id = item.getString("Id")
        val tags = item.optJSONObject("ImageTags")
        val path = when {
            isEpisode && item.has("ParentThumbItemId") -> "/Items/${item.getString("ParentThumbItemId")}/Images/Thumb"
            tags?.has("Thumb") == true -> "/Items/$id/Images/Thumb"
            isEpisode && tags?.has("Primary") == true -> "/Items/$id/Images/Primary"
            (item.optJSONArray("BackdropImageTags")?.length() ?: 0) > 0 -> "/Items/$id/Images/Backdrop/0"
            item.has("ParentBackdropItemId") -> "/Items/${item.getString("ParentBackdropItemId")}/Images/Backdrop/0"
            tags?.has("Primary") == true -> "/Items/$id/Images/Primary"
            else -> return null
        }
        return "$baseUrl$path?fillWidth=$IMAGE_WIDTH_PX&quality=90"
    }

    private fun get(path: String): String =
        open("$baseUrl$path").apply {
            setRequestProperty("Authorization", "MediaBrowser Token=\"${BuildConfig.JELLYFIN_API_KEY}\"")
        }.inputStream.bufferedReader().use { it.readText() }

    private fun open(url: String) = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 5_000
        readTimeout = 10_000
    }
}
