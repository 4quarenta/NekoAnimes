package com.nekoanimes.app.ads

import android.app.Activity
import android.content.Context
import android.content.pm.ActivityInfo
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.appopen.AppOpenAd
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform
import com.nekoanimes.app.model.AdsConfig

internal class AdMobController(context: Context) {
    private val appContext = context.applicationContext
    private val consentInformation = UserMessagingPlatform.getConsentInformation(appContext)
    private var config = AdsConfig.disabled()
    private var consentRequestStarted = false
    private var adsInitialized = false
    private var interstitial: InterstitialAd? = null
    private var appOpen: AppOpenAd? = null
    private var appOpenLoadedAt = 0L
    private var appOpenShownAt = 0L
    private var lastInterstitialShownAt = 0L
    private var appOpenCount = 0
    private var interstitialCount = 0
    private var pageTransitionCount = 0
    private var isForeground = false
    private var foregroundActivity: Activity? = null
    private var showingFullScreenAd = false

    var canRequestAds by mutableStateOf(false)
        private set
    var privacyOptionsRequired by mutableStateOf(false)
        private set

    fun configure(activity: Activity, nextConfig: AdsConfig) {
        config = nextConfig
        if (!nextConfig.enabled || nextConfig.provider != "admob") {
            canRequestAds = false
            interstitial = null
            appOpen = null
            return
        }

        if (consentRequestStarted) return
        consentRequestStarted = true
        val parameters = ConsentRequestParameters.Builder().build()
        consentInformation.requestConsentInfoUpdate(
            activity,
            parameters,
            {
                privacyOptionsRequired = consentInformation.privacyOptionsRequirementStatus == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) {
                    privacyOptionsRequired = consentInformation.privacyOptionsRequirementStatus == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED
                    initializeAds()
                }
            },
            { error ->
                Log.w(TAG, "Não foi possível atualizar o consentimento: ${error.message}")
                privacyOptionsRequired = consentInformation.privacyOptionsRequirementStatus == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED
                initializeAds()
            }
        )
    }

    fun onForeground(activity: Activity) {
        isForeground = true
        foregroundActivity = activity
        if (!canRequestAds || !config.enabled || !config.appOpen.enabled) return
        appOpenCount += 1
        if (appOpenCount <= config.appOpenSkipFirstOpens) {
            loadAppOpen()
            return
        }
        if (!isAppOpenEligible()) return
        appOpen?.let { showAppOpen(activity, it) } ?: loadAppOpen()
    }

    fun onBackground() {
        isForeground = false
        foregroundActivity = null
    }

    fun onPageTransition(activity: Activity) {
        if (!canRequestAds || !config.enabled || !config.interstitial.enabled) return
        pageTransitionCount += 1
        if (pageTransitionCount % config.interstitialPageTransitionFrequency == 0) {
            showInterstitialIfEligible(activity, onComplete = {})
        }
    }

    fun showEpisodeInterstitial(activity: Activity, onComplete: () -> Unit) {
        if (!config.interstitialShowOnEpisodeStart) {
            onComplete()
            return
        }
        showInterstitialIfEligible(activity, onComplete)
    }

    fun showPrivacyOptions(activity: Activity) {
        UserMessagingPlatform.showPrivacyOptionsForm(activity) { error ->
            if (error != null) Log.w(TAG, "Não foi possível abrir as opções de privacidade: ${error.message}")
            privacyOptionsRequired = consentInformation.privacyOptionsRequirementStatus == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED
        }
    }

    fun bannerAdUnitId(): String? = configuredUnit(config.banner.enabled, config.banner.unitId, TEST_BANNER_ID)

    private fun initializeAds() {
        if (!config.enabled || config.provider != "admob" || !consentInformation.canRequestAds()) return
        canRequestAds = true
        if (!adsInitialized) {
            adsInitialized = true
            MobileAds.initialize(appContext)
        }
        loadInterstitial()
        loadAppOpen()
    }

    private fun showInterstitialIfEligible(activity: Activity, onComplete: () -> Unit) {
        if (!canRequestAds || !config.enabled || !config.interstitial.enabled || showingFullScreenAd || interstitialCount >= config.interstitialMaxPerSession || !isIntervalElapsed(lastInterstitialShownAt, config.interstitialMinIntervalMinutes)) {
            onComplete()
            return
        }
        val ad = interstitial
        if (ad == null) {
            loadInterstitial()
            onComplete()
            return
        }
        showingFullScreenAd = true
        interstitial = null
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                finishInterstitial(onComplete)
            }

            override fun onAdFailedToShowFullScreenContent(adError: AdError) {
                Log.w(TAG, "Interstitial não abriu: ${adError.message}")
                finishInterstitial(onComplete)
            }
        }
        runCatching { ad.show(activity) }.onFailure {
            Log.w(TAG, "Interstitial não abriu", it)
            finishInterstitial(onComplete)
        }
    }

    private fun finishInterstitial(onComplete: () -> Unit) {
        if (!showingFullScreenAd) return
        showingFullScreenAd = false
        interstitialCount += 1
        lastInterstitialShownAt = System.currentTimeMillis()
        loadInterstitial()
        onComplete()
    }

    private fun loadInterstitial() {
        val unitId = configuredUnit(config.interstitial.enabled, config.interstitial.unitId, TEST_INTERSTITIAL_ID) ?: return
        if (!canRequestAds || interstitial != null || showingFullScreenAd) return
        InterstitialAd.load(appContext, unitId, AdRequest.Builder().build(), object : InterstitialAdLoadCallback() {
            override fun onAdLoaded(ad: InterstitialAd) {
                interstitial = ad
            }

            override fun onAdFailedToLoad(error: LoadAdError) {
                interstitial = null
                Log.w(TAG, "Interstitial não carregou: ${error.message}")
            }
        })
    }

    private fun loadAppOpen() {
        val unitId = configuredUnit(config.appOpen.enabled, config.appOpen.unitId, TEST_APP_OPEN_ID) ?: return
        if (!canRequestAds || appOpen != null || showingFullScreenAd) return
        AppOpenAd.load(appContext, unitId, AdRequest.Builder().build(), object : AppOpenAd.AppOpenAdLoadCallback() {
            override fun onAdLoaded(ad: AppOpenAd) {
                appOpen = ad
                appOpenLoadedAt = System.currentTimeMillis()
                val activity = foregroundActivity
                if (isForeground && activity != null && appOpenCount > config.appOpenSkipFirstOpens && isAppOpenEligible()) showAppOpen(activity, ad)
            }

            override fun onAdFailedToLoad(error: LoadAdError) {
                appOpen = null
                Log.w(TAG, "App Open não carregou: ${error.message}")
            }
        })
    }

    private fun showAppOpen(activity: Activity, ad: AppOpenAd) {
        if (showingFullScreenAd || ad !== appOpen || !isAppOpenEligible()) return
        showingFullScreenAd = true
        appOpen = null
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                finishAppOpen()
            }

            override fun onAdFailedToShowFullScreenContent(adError: AdError) {
                Log.w(TAG, "App Open não abriu: ${adError.message}")
                finishAppOpen()
            }
        }
        runCatching { ad.show(activity) }.onFailure {
            Log.w(TAG, "App Open não abriu", it)
            finishAppOpen()
        }
    }

    private fun finishAppOpen() {
        showingFullScreenAd = false
        appOpenShownAt = System.currentTimeMillis()
        loadAppOpen()
    }

    private fun isAppOpenEligible(): Boolean = isIntervalElapsed(appOpenShownAt, config.appOpenMinIntervalMinutes) && isFreshAppOpen()

    private fun isFreshAppOpen(): Boolean = appOpen != null && System.currentTimeMillis() - appOpenLoadedAt < APP_EXPIRATION_MILLIS

    private fun isIntervalElapsed(lastShownAt: Long, intervalMinutes: Int): Boolean = lastShownAt == 0L || System.currentTimeMillis() - lastShownAt >= intervalMinutes * 60_000L

    private fun configuredUnit(enabled: Boolean, unitId: String, testUnitId: String): String? {
        if (!canRequestAds || !config.enabled || config.provider != "admob" || !enabled) return null
        return if (config.testMode) testUnitId else unitId.trim().takeIf { it.isNotEmpty() }
    }

    private companion object {
        const val TAG = "NekoAdMob"
        const val APP_EXPIRATION_MILLIS = 60 * 60 * 1000L
        const val TEST_BANNER_ID = "ca-app-pub-3940256099942544/9214589741"
        const val TEST_INTERSTITIAL_ID = "ca-app-pub-3940256099942544/1033173712"
        const val TEST_APP_OPEN_ID = "ca-app-pub-3940256099942544/9257395920054042"
    }
}
