package com.nekoanimes.app.web

import org.junit.Assert.*
import org.junit.Test

class DocumentRecoveryTest {
    private val home = "https://app.example/"
    private val route = "https://app.example/busca?q=naruto&page=2#results"

    @Test fun defersFirstLoadWhileOffline() {
        val recovery = DocumentRecovery(home)
        assertEquals(home, recovery.recoveryUrl())
        recovery.started(home)
        assertNull(recovery.recoveryUrl())
    }

    @Test fun healthySpaIsNotReloadedOnReconnectOrResume() {
        val recovery = DocumentRecovery(home)
        recovery.started(home)
        recovery.finished(home)
        recovery.visited(route)
        recovery.interrupted()
        assertEquals(route, recovery.lastUrl)
        assertNull(recovery.recoveryUrl())
    }

    @Test fun chromiumErrorPageFinishedDoesNotClearFailure() {
        val recovery = DocumentRecovery(home)
        recovery.started(route)
        recovery.failed(route)
        recovery.finished(route)
        assertEquals(route, recovery.recoveryUrl())
        assertFalse(recovery.loading)
    }

    @Test fun reconnectRetriesInterruptedDocumentAtExactRoute() {
        val recovery = DocumentRecovery(home)
        recovery.started(route)
        recovery.interrupted()
        assertEquals(route, recovery.recoveryUrl())
        recovery.started(recovery.recoveryUrl()!!)
        recovery.finished(route)
        assertNull(recovery.recoveryUrl())
    }

    @Test fun repeatedFailureRemainsRetryable() {
        val recovery = DocumentRecovery(home)
        repeat(2) {
            recovery.started(route)
            recovery.failed(route)
            assertEquals(route, recovery.recoveryUrl())
        }
    }

    @Test fun lateOldDocumentFailureDoesNotReplaceCurrentNavigation() {
        val recovery = DocumentRecovery(home)
        recovery.started(home)
        recovery.started(route)
        recovery.failed(home)
        recovery.finished(home)
        assertNull(recovery.recoveryUrl())
        assertTrue(recovery.loading)
        assertEquals(route, recovery.lastUrl)
    }
}
