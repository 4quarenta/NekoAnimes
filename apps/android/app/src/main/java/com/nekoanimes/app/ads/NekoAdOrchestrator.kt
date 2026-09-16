package com.nekoanimes.app.ads

import android.app.Activity
import android.content.Context
import android.content.pm.ActivityInfo
import android.util.Log
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.appopen.AppOpenAd
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
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
    private var admobInterstitial: InterstitialAd? = null
    private var admobAppOpen: AppOpenAd? = null
    private var admobInterstitialLoading = false
    private var admobAppOpenLoading = false
    private var sessionInterstitials = 0
    private var pageTransitionCount = 0
    private var lastPageRoute: String? = null
    private var pendingInterstitialPlacement: String? = null
    private var appOpenForegroundGeneration = 0
    private var appOpenRequestedGeneration = -1
    private var appOpenPending = false
    private var appOpenGateActive = false
    private var fullscreenAdShowing = false
    private var orientationBeforeFullscreenAd: Int? = null

    fun initialize(onReady: () -> Unit = {}) {
        if (BuildConfig.ADMOB_TEST_MODE) {
            initializeAdMobTest(onReady)
            return
        }
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
            "page_transition" -> onPageTransition(placement)
            "episode_started" -> onEpisodeStarted()
        }
    }

    fun onPageTransition(route: String?) {
        if (!initialized || route.isNullOrBlank()) return
        val normalizedRoute = route.trim()
        val previousRoute = lastPageRoute
        lastPageRoute = normalizedRoute
        if (previousRoute == null || previousRoute == normalizedRoute) return
        if (appOpenGateActive) return

        pageTransitionCount += 1
        val frequency = config.interstitial.pageTransitionFrequency
        if (frequency > 0 && pageTransitionCount >= frequency) {
            pageTransitionCount = 0
            showInterstitialIfEligible("page_transition")
        }
    }

    fun onEpisodeStarted() {
        if (!initialized || appOpenGateActive || !config.interstitial.showOnEpisodeStart) return
        pageTransitionCount = 0
        showInterstitialIfEligible("episode_start", queueIfNotReady = true)
    }

    fun onAppBackgrounded() {
        if (fullscreenAdShowing) return
        appOpenForegroundGeneration += 1
        appOpenRequestedGeneration = -1
        appOpenPending = false
        appOpenGateActive = false
        pageTransitionCount = 0
        lastPageRoute = null
    }

    fun showAppOpenIfEligible() {
        if (appOpenRequestedGeneration == appOpenForegroundGeneration) return
        appOpenRequestedGeneration = appOpenForegroundGeneration
        if (!initialized) {
            appOpenPending = true
            appOpenGateActive = config.appOpen.enabled
            return
        }
        appOpenGateActive = config.appOpen.enabled
        showAppOpenNowIfEligible()
    }

    private fun showAppOpenNowIfEligible() {
        if (BuildConfig.ADMOB_TEST_MODE) {
            showAdMobTestAppOpenIfEligible()
            return
        }
        if (!initialized || !config.appOpen.enabled || BuildConfig.MAX_APP_OPEN_AD_UNIT_ID.isBlank()) {
            appOpenGateActive = false
            return
        }
        val opens = prefs.getInt(KEY_OPEN_COUNT, 0) + 1
        prefs.edit().putInt(KEY_OPEN_COUNT, opens).apply()
        if (opens <= config.appOpen.skipFirstOpens) {
            appOpenGateActive = false
            return
        }
        if (!cooldownPassed(KEY_LAST_APP_OPEN, config.appOpen.minIntervalMinutes)) {
            appOpenGateActive = false
            return
        }

        val ad = appOpen ?: run {
            appOpenPending = true
            return
        }
        if (ad.isReady) {
            appOpenPending = false
            fullscreenAdShowing = true
            enterPortraitForFullscreenAd()
            ad.showAd("app_open")
            prefs.edit().putLong(KEY_LAST_APP_OPEN, System.currentTimeMillis()).apply()
        } else {
            appOpenPending = true
            ad.loadAd()
        }
    }

    private fun showInterstitialIfEligible(placement: String, queueIfNotReady: Boolean = false) {
        if (appOpenGateActive) return
        if (BuildConfig.ADMOB_TEST_MODE) {
            showAdMobTestInterstitialIfEligible(placement)
            return
        }
        if (!config.interstitial.enabled || BuildConfig.MAX_INTERSTITIAL_AD_UNIT_ID.isBlank()) return
        if (sessionInterstitials >= config.interstitial.maxPerSession) return
        if (!cooldownPassed(KEY_LAST_INTERSTITIAL, config.interstitial.minIntervalMinutes)) return

        val ad = interstitial ?: return
        if (ad.isReady) {
            fullscreenAdShowing = true
            enterPortraitForFullscreenAd()
            ad.showAd(placement)
            sessionInterstitials += 1
            prefs.edit().putLong(KEY_LAST_INTERSTITIAL, System.currentTimeMillis()).apply()
        } else {
            if (queueIfNotReady) pendingInterstitialPlacement = placement
            ad.loadAd()
        }
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
            if (appOpenPending) showAppOpenNowIfEligible()
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
        if (ad.adUnitId == BuildConfig.MAX_APP_OPEN_AD_UNIT_ID && appOpenPending) {
            appOpenPending = false
            showAppOpenNowIfEligible()
        }
    }

    private fun initializeAdMobTest(onReady: () -> Unit) {
        if (initialized) {
            onReady()
            return
        }
        MobileAds.initialize(activity) {
            initialized = true
            Log.i(TAG, "AdMob test mode initialized")
            loadAdMobTestInterstitial()
            loadAdMobTestAppOpen()
            onReady()
            if (appOpenPending) showAppOpenNowIfEligible()
        }
    }

    private fun loadAdMobTestInterstitial() {
        if (!initialized || admobInterstitialLoading || admobInterstitial != null || !config.interstitial.enabled) return
        admobInterstitialLoading = true
        InterstitialAd.load(
            activity,
            GoogleAdMobTestAds.INTERSTITIAL_AD_UNIT_ID,
            AdRequest.Builder().build(),
            object : InterstitialAdLoadCallback() {
                override fun onAdLoaded(ad: InterstitialAd) {
                    admobInterstitialLoading = false
                    admobInterstitial = ad
                    Log.i(TAG, "AdMob test ad loaded format=INTERSTITIAL")
                    pendingInterstitialPlacement?.let { placement ->
                        pendingInterstitialPlacement = null
                        showInterstitialIfEligible(placement)
                    }
                }

                override fun onAdFailedToLoad(error: LoadAdError) {
                    admobInterstitialLoading = false
                    Log.w(TAG, "AdMob test ad failed format=INTERSTITIAL code=${error.code}")
                }
            }
        )
    }

    private fun loadAdMobTestAppOpen() {
        if (!initialized || admobAppOpenLoading || admobAppOpen != null || !config.appOpen.enabled) return
        admobAppOpenLoading = true
        AppOpenAd.load(
            activity,
            GoogleAdMobTestAds.APP_OPEN_AD_UNIT_ID,
            AdRequest.Builder().build(),
            object : AppOpenAd.AppOpenAdLoadCallback() {
                override fun onAdLoaded(ad: AppOpenAd) {
                    admobAppOpenLoading = false
                    admobAppOpen = ad
                    Log.i(TAG, "AdMob test ad loaded format=APP_OPEN")
                    if (appOpenPending) {
                        appOpenPending = false
                        showAppOpenNowIfEligible()
                    }
                }

                override fun onAdFailedToLoad(error: LoadAdError) {
                    admobAppOpenLoading = false
                    appOpenPending = false
                    appOpenGateActive = false
                    Log.w(TAG, "AdMob test ad failed format=APP_OPEN code=${error.code}")
                }
            }
        )
    }

    private fun showAdMobTestAppOpenIfEligible() {
        if (!initialized || !config.appOpen.enabled) {
            appOpenGateActive = false
            return
        }
        val opens = prefs.getInt(KEY_OPEN_COUNT, 0) + 1
        prefs.edit().putInt(KEY_OPEN_COUNT, opens).apply()
        if (opens <= config.appOpen.skipFirstOpens) {
            appOpenGateActive = false
            return
        }
        if (!cooldownPassed(KEY_LAST_APP_OPEN, config.appOpen.minIntervalMinutes)) {
            appOpenGateActive = false
            return
        }

        val ad = admobAppOpen
        if (ad == null) {
            appOpenPending = true
            loadAdMobTestAppOpen()
            return
        }
        admobAppOpen = null
        appOpenPending = false
        fullscreenAdShowing = true
        enterPortraitForFullscreenAd()
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdShowedFullScreenContent() { Log.i(TAG, "AdMob test ad displayed format=APP_OPEN") }
            override fun onAdDismissedFullScreenContent() {
                fullscreenAdShowing = false
                appOpenGateActive = false
                restoreOrientationAfterFullscreenAd()
                loadAdMobTestAppOpen()
            }
            override fun onAdFailedToShowFullScreenContent(error: AdError) {
                fullscreenAdShowing = false
                appOpenGateActive = false
                restoreOrientationAfterFullscreenAd()
                Log.w(TAG, "AdMob test ad display failed format=APP_OPEN code=${error.code}")
                loadAdMobTestAppOpen()
            }
        }
        ad.show(activity)
        prefs.edit().putLong(KEY_LAST_APP_OPEN, System.currentTimeMillis()).apply()
    }

    private fun showAdMobTestInterstitialIfEligible(placement: String) {
        if (!initialized || appOpenGateActive || !config.interstitial.enabled) return
        if (sessionInterstitials >= config.interstitial.maxPerSession) return
        if (!cooldownPassed(KEY_LAST_INTERSTITIAL, config.interstitial.minIntervalMinutes)) return

        val ad = admobInterstitial
        if (ad == null) {
            loadAdMobTestInterstitial()
            return
        }
        admobInterstitial = null
        fullscreenAdShowing = true
        enterPortraitForFullscreenAd()
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdShowedFullScreenContent() { Log.i(TAG, "AdMob test ad displayed format=INTERSTITIAL placement=$placement") }
            override fun onAdDismissedFullScreenContent() {
                fullscreenAdShowing = false
                restoreOrientationAfterFullscreenAd()
                loadAdMobTestInterstitial()
            }
            override fun onAdFailedToShowFullScreenContent(error: AdError) {
                fullscreenAdShowing = false
                restoreOrientationAfterFullscreenAd()
                Log.w(TAG, "AdMob test ad display failed format=INTERSTITIAL code=${error.code}")
                loadAdMobTestInterstitial()
            }
        }
        ad.show(activity)
        sessionInterstitials += 1
        prefs.edit().putLong(KEY_LAST_INTERSTITIAL, System.currentTimeMillis()).apply()
    }

    private fun enterPortraitForFullscreenAd() {
        if (orientationBeforeFullscreenAd == null) {
            orientationBeforeFullscreenAd = activity.requestedOrientation
        }
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    }

    private fun restoreOrientationAfterFullscreenAd() {
        val previousOrientation = orientationBeforeFullscreenAd ?: return
        orientationBeforeFullscreenAd = null
        if (!activity.isFinishing) {
            activity.requestedOrientation = previousOrientation
        }
    }

    override fun onAdDisplayed(ad: MaxAd) {
        fullscreenAdShowing = true
        Log.i(TAG, "Ad displayed format=${ad.format.label} network=${ad.networkName}")
    }
    override fun onAdClicked(ad: MaxAd) = Unit
    override fun onAdHidden(ad: MaxAd) {
        fullscreenAdShowing = false
        restoreOrientationAfterFullscreenAd()
        if (ad.adUnitId == BuildConfig.MAX_APP_OPEN_AD_UNIT_ID) appOpenGateActive = false
        if (ad.adUnitId == BuildConfig.MAX_INTERSTITIAL_AD_UNIT_ID) interstitial?.loadAd()
        if (ad.adUnitId == BuildConfig.MAX_APP_OPEN_AD_UNIT_ID) appOpen?.loadAd()
    }
    override fun onAdLoadFailed(adUnitId: String, error: MaxError) {
        if (adUnitId == BuildConfig.MAX_APP_OPEN_AD_UNIT_ID) {
            appOpenPending = false
            appOpenGateActive = false
        }
        Log.w(TAG, "Ad load failed for $adUnitId: ${error.code}")
    }
    override fun onAdDisplayFailed(ad: MaxAd, error: MaxError) {
        fullscreenAdShowing = false
        restoreOrientationAfterFullscreenAd()
        if (ad.adUnitId == BuildConfig.MAX_APP_OPEN_AD_UNIT_ID) appOpenGateActive = false
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
