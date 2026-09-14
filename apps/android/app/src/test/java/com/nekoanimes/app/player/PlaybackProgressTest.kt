package com.nekoanimes.app.player

import org.junit.Assert.*
import org.junit.Test

class PlaybackProgressTest {
    @Test fun omittedPositionDefaultsToZero() {
        assertEquals(0, parseStartPositionSeconds(null, false))
    }

    @Test fun acceptsWholeSecondsAndBothBoundaries() {
        listOf(0, 600L, 600.0, 604800).forEach {
            assertEquals(it.toInt(), parseStartPositionSeconds(it, true))
        }
    }

    @Test fun rejectsCoercionsNullFractionsOverflowAndNonFiniteValues() {
        listOf(null, "600", true, -1, 604801, 0.5, Long.MAX_VALUE, Double.NaN, Double.POSITIVE_INFINITY).forEach {
            assertThrows(IllegalArgumentException::class.java) { parseStartPositionSeconds(it, true) }
        }
    }

    @Test fun openingAndCancelingBeforeReadyCannotOverwriteProgress() {
        assertNull(PlaybackProgress().capture(0, 0))
        assertNull(PlaybackProgress().capture(600_000, 1_200_000))
    }

    @Test fun preparedMediaProducesResumeCheckpoint() {
        val progress = PlaybackProgress()
        progress.onReady()
        assertEquals(PlaybackCheckpoint(615, 1200), progress.capture(615_999, 1_200_000))
        assertEquals(PlaybackCheckpoint(615, 1200), progress.lastCheckpoint)
    }

    @Test fun errorInvalidatesCloseAndAllLaterCheckpointsButPreservesRetryPosition() {
        val progress = PlaybackProgress()
        progress.onReady()
        progress.capture(600_000, 1_200_000)
        progress.onError()
        progress.onReady()
        assertNull(progress.capture(0, 0))
        assertNull(progress.capture(601_000, 1_200_000))
        assertEquals(600, progress.lastCheckpoint?.positionSeconds)
        val retry = PlaybackProgress()
        assertNull(retry.capture(600_000, 1_200_000))
        retry.onReady()
        assertEquals(601, retry.capture(601_000, 1_200_000)?.positionSeconds)
    }

    @Test fun rejectsUnknownDurationNegativePositionAndOutOfContractDuration() {
        val progress = PlaybackProgress()
        progress.onReady()
        listOf(Long.MIN_VALUE + 1, -1L, 0L, 999L, 604800001L).forEach {
            assertNull(progress.capture(0, it))
        }
        assertNull(progress.capture(-1, 1_200_000))
    }

    @Test fun clampsSeekPastEndAndAcceptsMaximumDuration() {
        val progress = PlaybackProgress()
        progress.onReady()
        assertEquals(PlaybackCheckpoint(1200, 1200), progress.capture(Long.MAX_VALUE, 1_200_000))
        assertEquals(PlaybackCheckpoint(604800, 604800), progress.capture(604800000, 604800000))
    }
}
