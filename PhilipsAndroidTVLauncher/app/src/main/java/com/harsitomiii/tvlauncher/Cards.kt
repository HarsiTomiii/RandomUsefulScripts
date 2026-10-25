package com.harsitomiii.tvlauncher

import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.roundToInt

/** Tile sizes in dp; [gapDp] is the space before the tile when it isn't first in its row/column. */
enum class CardSize(val widthDp: Int, val heightDp: Int, val gapDp: Int, val iconDp: Int, val labelSp: Float) {
    HERO(320, 180, 24, 88, 22f),
    SIDE(160, 82, 16, 32, 14f),
    GRID(160, 90, 16, 40, 14f),
    MEDIA(192, 108, 20, 0, 0f),
}

/** Builds the focusable tiles used on both screens. */
object Cards {
    private const val FOCUS_SCALE = 1.06f

    private val focusAnimator = View.OnFocusChangeListener { view, focused ->
        val scale = if (focused) FOCUS_SCALE else 1f
        view.animate().scaleX(scale).scaleY(scale).translationZ(if (focused) 8f else 0f)
            .setDuration(120).start()
    }

    /** A banner card (All apps grid) or plain text card. */
    fun add(parent: LinearLayout, size: CardSize): View = attach(parent, size, R.layout.item_app)

    /** A home screen tile drawn from the app's hi-res icon on a gradient. */
    fun addTile(parent: LinearLayout, size: CardSize, tile: Tile, app: AppEntry): View {
        val card = attach(parent, size, R.layout.item_tile)
        card.background = GradientDrawable(GradientDrawable.Orientation.TL_BR, tile.colors).apply {
            cornerRadius = dp(card, 12f)
        }
        val image = card.findViewById<ImageView>(R.id.image)
        val iconPx = dp(card, size.iconDp.toFloat()).roundToInt()
        image.layoutParams = image.layoutParams.apply { width = iconPx; height = iconPx }
        if (tile.icon != null) image.setImageResource(tile.icon) else image.setImageDrawable(app.icon)

        val label = card.findViewById<TextView>(R.id.label)
        label.text = app.label
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, size.labelSp)
        label.setPadding(0, dp(card, size.iconDp / 8f).roundToInt(), 0, 0)
        card.contentDescription = app.label
        return card
    }

    fun bindApp(card: View, app: AppEntry) {
        val image = card.findViewById<ImageView>(R.id.image)
        val label = card.findViewById<TextView>(R.id.label)
        card.contentDescription = app.label
        if (app.banner != null) {
            image.scaleType = ImageView.ScaleType.CENTER_CROP
            image.setImageDrawable(app.banner)
            label.visibility = View.GONE
        } else {
            // No TV banner: show the icon above the app name.
            val pad = card.layoutParams.height / 5
            image.setPadding(pad, pad / 2, pad, pad * 2)
            image.scaleType = ImageView.ScaleType.FIT_CENTER
            image.setImageDrawable(app.icon)
            label.text = app.label
            label.visibility = View.VISIBLE
        }
    }

    fun bindText(card: View, text: CharSequence) {
        val label = card.findViewById<TextView>(R.id.label)
        label.text = text
        label.visibility = View.VISIBLE
        (label.layoutParams as FrameLayout.LayoutParams).gravity = Gravity.CENTER
        card.contentDescription = text
    }

    /** A "Continue watching" entry. Returns the image view so the caller can load the picture. */
    fun addMedia(parent: LinearLayout, item: MediaItem, onClick: () -> Unit): ImageView {
        val size = CardSize.MEDIA
        val column = LayoutInflater.from(parent.context).inflate(R.layout.item_media, parent, false)
        column.layoutParams = LinearLayout.LayoutParams(
            dp(parent, size.widthDp.toFloat()).roundToInt(),
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { if (parent.childCount > 0) marginStart = dp(parent, size.gapDp.toFloat()).roundToInt() }

        val card = column.findViewById<View>(R.id.card)
        card.layoutParams.height = dp(parent, size.heightDp.toFloat()).roundToInt()
        card.clipToOutline = true
        card.onFocusChangeListener = focusAnimator
        card.contentDescription = item.title
        card.setOnClickListener { onClick() }

        column.findViewById<TextView>(R.id.title).text = item.title
        column.findViewById<TextView>(R.id.subtitle).text = item.subtitle
        if (item.progress > 0f) {
            column.findViewById<View>(R.id.progress).visibility = View.VISIBLE
            val fill = column.findViewById<View>(R.id.progress_fill)
            (fill.layoutParams as LinearLayout.LayoutParams).weight = item.progress.coerceIn(0f, 1f)
        }
        parent.addView(column)
        return column.findViewById(R.id.image)
    }

    fun firstCard(parent: LinearLayout): View? = parent.getChildAt(0)

    private fun attach(parent: LinearLayout, size: CardSize, layout: Int): View {
        val card = LayoutInflater.from(parent.context).inflate(layout, parent, false)
        card.layoutParams = LinearLayout.LayoutParams(
            dp(parent, size.widthDp.toFloat()).roundToInt(),
            dp(parent, size.heightDp.toFloat()).roundToInt(),
        ).apply {
            if (parent.childCount > 0) {
                val gap = dp(parent, size.gapDp.toFloat()).roundToInt()
                if (parent.orientation == LinearLayout.VERTICAL) topMargin = gap else marginStart = gap
            }
        }
        // Clips the content to the background's rounded corners.
        card.clipToOutline = true
        card.onFocusChangeListener = focusAnimator
        parent.addView(card)
        return card
    }

    private fun dp(view: View, value: Float) = value * view.resources.displayMetrics.density
}
