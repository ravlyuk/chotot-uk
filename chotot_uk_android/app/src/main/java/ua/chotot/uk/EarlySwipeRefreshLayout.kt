package ua.chotot.uk

import android.content.Context
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.ViewConfiguration
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import kotlin.math.abs

class EarlySwipeRefreshLayout @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : SwipeRefreshLayout(context, attrs) {
    private val interceptSlop = ViewConfiguration.get(context).scaledTouchSlop
    private var startX = 0f
    private var startY = 0f

    override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
        if (!isEnabled) {
            return super.onInterceptTouchEvent(event)
        }
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                startX = event.x
                startY = event.y
            }
            MotionEvent.ACTION_MOVE -> {
                val dy = event.y - startY
                val dx = event.x - startX
                if (dy > interceptSlop && dy > abs(dx) && !canChildScrollUp()) {
                    return true
                }
            }
        }
        return super.onInterceptTouchEvent(event)
    }
}
