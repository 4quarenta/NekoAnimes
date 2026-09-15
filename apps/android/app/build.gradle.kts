plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

val releaseStoreFile = providers.environmentVariable("NEKO_RELEASE_STORE_FILE")
val releaseStorePassword = providers.environmentVariable("NEKO_RELEASE_STORE_PASSWORD")
val releaseKeyAlias = providers.environmentVariable("NEKO_RELEASE_KEY_ALIAS")
val releaseKeyPassword = providers.environmentVariable("NEKO_RELEASE_KEY_PASSWORD")
val hasReleaseSigning = releaseStoreFile.isPresent && releaseStorePassword.isPresent && releaseKeyAlias.isPresent && releaseKeyPassword.isPresent
fun nekoUrl(property: String, fallback: String) = providers.gradleProperty(property).orElse(fallback).get()
val maxTestMode = providers.gradleProperty("maxTestMode").map { it.toBoolean() }.orElse(false).get()
val maxTestDeviceAdvertisingId = providers.gradleProperty("maxTestDeviceAdvertisingId").orElse("").get()
val googleAdMobAppId = providers.gradleProperty("googleAdMobAppId")
    .orElse(if (maxTestMode) "ca-app-pub-3940256099942544~3347511713" else "")
    .get()

android {
    namespace = "com.nekoanimes.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.nekoanimes.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 10036
        versionName = "1.0.36"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "MAX_SDK_KEY", "\"${providers.gradleProperty("MAX_SDK_KEY").orElse("").get()}\"")
        buildConfigField("String", "MAX_BANNER_AD_UNIT_ID", "\"${providers.gradleProperty("MAX_BANNER_AD_UNIT_ID").orElse("").get()}\"")
        buildConfigField("String", "MAX_APP_OPEN_AD_UNIT_ID", "\"${providers.gradleProperty("MAX_APP_OPEN_AD_UNIT_ID").orElse("").get()}\"")
        buildConfigField("String", "MAX_INTERSTITIAL_AD_UNIT_ID", "\"${providers.gradleProperty("MAX_INTERSTITIAL_AD_UNIT_ID").orElse("").get()}\"")
        buildConfigField("boolean", "MAX_TEST_MODE", maxTestMode.toString())
        buildConfigField("String", "MAX_TEST_DEVICE_ADVERTISING_ID", "\"$maxTestDeviceAdvertisingId\"")
        manifestPlaceholders["googleAdMobAppId"] = googleAdMobAppId
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseStoreFile.get())
                storePassword = releaseStorePassword.get()
                keyAlias = releaseKeyAlias.get()
                keyPassword = releaseKeyPassword.get()
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = true
            }
        }
    }

    flavorDimensions += "distribution"
    productFlavors {
        create("direct") {
            dimension = "distribution"
            versionCode = 10038
            versionName = "1.0.38"
            buildConfigField("boolean", "SELF_UPDATE_ENABLED", "true")
            buildConfigField("String", "DISTRIBUTION_CHANNEL", "\"direct\"")
        }
        create("play") {
            dimension = "distribution"
            buildConfigField("boolean", "SELF_UPDATE_ENABLED", "false")
            buildConfigField("String", "DISTRIBUTION_CHANNEL", "\"play\"")
        }
    }

    buildTypes {
        debug {
            versionNameSuffix = "-debug"
            buildConfigField("String", "WEB_APP_URL", "\"${nekoUrl("nekoWebAppUrl", "http://10.0.2.2:5173")}\"")
            buildConfigField("String", "WEB_APP_ORIGIN", "\"${nekoUrl("nekoWebAppOrigin", "http://10.0.2.2:5173")}\"")
            buildConfigField("String", "API_BASE_URL", "\"${nekoUrl("nekoApiBaseUrl", "http://10.0.2.2:3000")}\"")
        }

        release {
            isDebuggable = false
            isMinifyEnabled = true
            isShrinkResources = true
            if (hasReleaseSigning) signingConfig = signingConfigs.getByName("release")

            buildConfigField("String", "WEB_APP_URL", "\"${nekoUrl("nekoWebAppUrl", "https://app.nekoanimes.com")}\"")
            buildConfigField("String", "WEB_APP_ORIGIN", "\"${nekoUrl("nekoWebAppOrigin", "https://app.nekoanimes.com")}\"")
            buildConfigField("String", "API_BASE_URL", "\"${nekoUrl("nekoApiBaseUrl", "https://api.nekoanimes.com")}\"")

            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    val composeBom = platform("androidx.compose:compose-bom:2026.06.00")

    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.18.0")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.ui:ui-viewbinding")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    implementation("androidx.webkit:webkit:1.17.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.2.0")
    implementation("androidx.media3:media3-exoplayer:1.11.0")
    implementation("androidx.media3:media3-exoplayer-hls:1.11.0")
    implementation("androidx.media3:media3-exoplayer-dash:1.11.0")
    implementation("androidx.media3:media3-ui:1.11.0")

    implementation("com.applovin:applovin-sdk:13.6.4")
    // MAX mediation adapters. Network activation remains controlled by MAX.
    implementation("com.applovin.mediation:google-adapter:25.4.0.0")
    implementation("com.applovin.mediation:facebook-adapter:6.22.0.0")
    implementation("com.google.android.ump:user-messaging-platform:4.0.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
