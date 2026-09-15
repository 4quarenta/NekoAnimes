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
import android.util.Log
import com.applovin.mediation.MaxAd
import com.applovin.mediation.MaxAdViewAdListener
import com.applovin.mediation.MaxError
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
                MaxAdView(BuildConfig.MAX_BANNER_AD_UNIT_ID, context).apply {
                    setListener(object : MaxAdViewAdListener {
                        override fun onAdLoaded(ad: MaxAd) {
                            Log.i(TAG, "Ad loaded format=${ad.format.label} network=${ad.networkName}")
                        }
                        override fun onAdLoadFailed(adUnitId: String, error: MaxError) {
                            Log.w(TAG, "Ad load failed for $adUnitId: ${error.code}")
                        }
                        override fun onAdClicked(ad: MaxAd) = Unit
                        override fun onAdExpanded(ad: MaxAd) = Unit
                        override fun onAdCollapsed(ad: MaxAd) = Unit
                        override fun onAdDisplayed(ad: MaxAd) {
                            Log.i(TAG, "Ad displayed format=${ad.format.label} network=${ad.networkName}")
                        }
                        override fun onAdDisplayFailed(ad: MaxAd, error: MaxError) {
                            Log.w(TAG, "Ad display failed: ${error.code}")
                        }
                        override fun onAdHidden(ad: MaxAd) = Unit
                    })
                    loadAd()
                }
            },
            onRelease = { it.destroy() }
        )
    }
}

private const val TAG = "NekoAds"
