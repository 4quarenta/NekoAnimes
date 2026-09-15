package com.nekoanimes.app.ads

import android.app.Activity
import android.content.Context
import android.util.Log
import java.util.Collections
import com.applovin.mediation.MaxAd
import com.applovin.mediation.MaxAdListener
import com.applovin.mediation.MaxError
import com.applovin.mediation.ads.MaxAppOpenAd
import com.applovin.mediation.ads.MaxInterstitialAd
import com.applovin.sdk.AppLovinMediationProvider
import com.applovin.sdk.AppLovinSdk
import com.applovin.sdk.AppLovinSdkInitializationConfiguration
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform
import com.nekoanimes.app.BuildConfig
import com.nekoanimes.app.model.AdsConfig

class NekoAdOrchestrator(
    private val activity: Activity,
    private val config: AdsConfig
) : MaxAdListener {
    private val prefs = activity.getSharedPreferences("neko_ads", Context.MODE_PRIVATE)
    private var initialized = false
    private var interstitial: MaxInterstitialAd? = null
    private var appOpen: MaxAppOpenAd? = null
    private var sessionInterstitials = 0

    fun initialize(onReady: () -> Unit = {}) {
        if (!isSdkConfigured()) {
            Log.i(TAG, "Ads disabled: engine/config/credentials unavailable")
            onReady()
            return
        }

        val consent = UserMessagingPlatform.getConsentInformation(activity)
        val params = ConsentRequestParameters.Builder().build()
        consent.requestConsentInfoUpdate(
            activity,
            params,
            {
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) {
                    if (consent.canRequestAds()) initializeMax(onReady) else onReady()
                }
            },
            {
                if (consent.canRequestAds()) initializeMax(onReady) else onReady()
            }
        )
    }

    fun onAppEvent(name: String, placement: String?) {
        if (!initialized) return
        when (name) {
            "content_opened", "episode_closed", "article_opened" -> showInterstitialIfEligible(placement ?: name)
        }
    }

    fun showAppOpenIfEligible() {
        if (!initialized || !config.appOpen.enabled || BuildConfig.MAX_APP_OPEN_AD_UNIT_ID.isBlank()) return
        val opens = prefs.getInt(KEY_OPEN_COUNT, 0) + 1
        prefs.edit().putInt(KEY_OPEN_COUNT, opens).apply()
        if (opens <= config.appOpen.skipFirstOpens) return
        if (!cooldownPassed(KEY_LAST_APP_OPEN, config.appOpen.minIntervalMinutes)) return

        val ad = appOpen ?: return
        if (ad.isReady) {
            ad.showAd("app_open")
            prefs.edit().putLong(KEY_LAST_APP_OPEN, System.currentTimeMillis()).apply()
        } else ad.loadAd()
    }

    private fun showInterstitialIfEligible(placement: String) {
        if (!config.interstitial.enabled || BuildConfig.MAX_INTERSTITIAL_AD_UNIT_ID.isBlank()) return
        if (sessionInterstitials >= config.interstitial.maxPerSession) return
        if (!cooldownPassed(KEY_LAST_INTERSTITIAL, config.interstitial.minIntervalMinutes)) return

        val ad = interstitial ?: return
        if (ad.isReady) {
            ad.showAd(placement)
            sessionInterstitials += 1
            prefs.edit().putLong(KEY_LAST_INTERSTITIAL, System.currentTimeMillis()).apply()
        } else ad.loadAd()
    }

    private fun initializeMax(onReady: () -> Unit) {
        if (initialized) {
            onReady()
            return
        }
        val initConfigBuilder = AppLovinSdkInitializationConfiguration.builder(BuildConfig.MAX_SDK_KEY)
            .setMediationProvider(AppLovinMediationProvider.MAX)
        if (BuildConfig.MAX_TEST_MODE && BuildConfig.MAX_TEST_DEVICE_ADVERTISING_ID.isNotBlank()) {
            initConfigBuilder.setTestDeviceAdvertisingIds(
                Collections.singletonList(BuildConfig.MAX_TEST_DEVICE_ADVERTISING_ID)
            )
            Log.i(TAG, "MAX Test Mode enabled for configured staging device")
        }
        val initConfig = initConfigBuilder.build()

        AppLovinSdk.getInstance(activity).initialize(initConfig) {
            initialized = true
            if (config.interstitial.enabled && BuildConfig.MAX_INTERSTITIAL_AD_UNIT_ID.isNotBlank()) {
                interstitial = MaxInterstitialAd(BuildConfig.MAX_INTERSTITIAL_AD_UNIT_ID, activity).also {
                    it.setListener(this)
                    it.loadAd()
                }
            }
            if (config.appOpen.enabled && BuildConfig.MAX_APP_OPEN_AD_UNIT_ID.isNotBlank()) {
                appOpen = MaxAppOpenAd(BuildConfig.MAX_APP_OPEN_AD_UNIT_ID, activity).also {
                    it.setListener(this)
                    it.loadAd()
                }
            }
            onReady()
        }
    }

    private fun isSdkConfigured(): Boolean =
        config.enabled && config.engine == "max" && BuildConfig.MAX_SDK_KEY.isNotBlank()

    private fun cooldownPassed(key: String, minutes: Int): Boolean {
        val last = prefs.getLong(key, 0L)
        return System.currentTimeMillis() - last >= minutes * 60_000L
    }

    override fun onAdLoaded(ad: MaxAd) {
        Log.i(TAG, "Ad loaded format=${ad.format.label} network=${ad.networkName}")
    }
    override fun onAdDisplayed(ad: MaxAd) {
        Log.i(TAG, "Ad displayed format=${ad.format.label} network=${ad.networkName}")
    }
    override fun onAdClicked(ad: MaxAd) = Unit
    override fun onAdHidden(ad: MaxAd) {
        if (ad.adUnitId == BuildConfig.MAX_INTERSTITIAL_AD_UNIT_ID) interstitial?.loadAd()
        if (ad.adUnitId == BuildConfig.MAX_APP_OPEN_AD_UNIT_ID) appOpen?.loadAd()
    }
    override fun onAdLoadFailed(adUnitId: String, error: MaxError) {
        Log.w(TAG, "Ad load failed for $adUnitId: ${error.code}")
    }
    override fun onAdDisplayFailed(ad: MaxAd, error: MaxError) {
        Log.w(TAG, "Ad display failed: ${error.code}")
        if (ad.adUnitId == BuildConfig.MAX_INTERSTITIAL_AD_UNIT_ID) interstitial?.loadAd()
        if (ad.adUnitId == BuildConfig.MAX_APP_OPEN_AD_UNIT_ID) appOpen?.loadAd()
    }

    companion object {
        private const val TAG = "NekoAds"
        private const val KEY_OPEN_COUNT = "open_count"
        private const val KEY_LAST_APP_OPEN = "last_app_open"
        private const val KEY_LAST_INTERSTITIAL = "last_interstitial"
    }
}
