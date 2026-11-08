package cn.moment.lumix;

/**
 * A swipe, the first-run full-screen prompt, a dialog, or a resume can leave the status bar up.
 * Hide it again on one deadline. Later samples while it is still up must not keep postponing that.
 */
public final class ImmersiveChrome {
    public static final long REHIDE_MS = 3_000L;
    /** No hide is waiting. Zero is a legal clock reading, so this stays negative. */
    public static final long UNSCHEDULED = -1L;

    private ImmersiveChrome() {}

    /**
     * @param scheduledAt the deadline already chosen, or {@link #UNSCHEDULED}
     * @return that deadline, a new one, or {@link #UNSCHEDULED} when the bar is not ours to hide
     */
    public static long hideAt(long nowMs, boolean statusBarVisible, boolean focused, long scheduledAt) {
        // The system confirmation owns the screen until it returns focus. Hiding during it is ignored
        // and can leave the bar stuck afterwards, so wait until this window is focused again.
        if (!focused || !statusBarVisible) return UNSCHEDULED;
        if (scheduledAt >= 0) return scheduledAt;
        return nowMs + REHIDE_MS;
    }

    public static boolean due(long nowMs, long scheduledAt) {
        return scheduledAt >= 0 && nowMs >= scheduledAt;
    }
}
