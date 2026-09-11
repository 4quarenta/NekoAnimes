package com.nekoanimes.app.ads

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.applovin.mediation.ads.MaxAdView
import com.nekoanimes.app.BuildConfig
import com.nekoanimes.app.model.AdsConfig

@Composable
fun NekoBannerSlot(config: AdsConfig, modifier: Modifier = Modifier) {
    if (!config.enabled || config.engine != "max" || !config.banner.enabled || BuildConfig.MAX_BANNER_AD_UNIT_ID.isBlank()) return

    val context = LocalContext.current
    Box(modifier = modifier.fillMaxWidth().height(50.dp), contentAlignment = Alignment.Center) {
        AndroidView(
            modifier = Modifier.fillMaxWidth().height(50.dp),
            factory = {
                MaxAdView(BuildConfig.MAX_BANNER_AD_UNIT_ID, context).apply { loadAd() }
            },
            onRelease = { it.destroy() }
        )
    }
}
