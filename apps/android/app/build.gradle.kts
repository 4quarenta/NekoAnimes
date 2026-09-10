plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.nekoanimes.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.nekoanimes.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            buildConfigField("String", "WEB_APP_URL", "\"http://10.0.2.2:5173\"")
            buildConfigField("String", "WEB_APP_ORIGIN", "\"http://10.0.2.2:5173\"")
            buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:3000\"")
        }

        release {
            isMinifyEnabled = true
            isShrinkResources = true

            buildConfigField("String", "WEB_APP_URL", "\"https://app.nekoanimes.com\"")
            buildConfigField("String", "WEB_APP_ORIGIN", "\"https://app.nekoanimes.com\"")
            buildConfigField("String", "API_BASE_URL", "\"https://api.nekoanimes.com\"")

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
    // Keep the Android 16 production baseline. Compose 1.12+ requires compileSdk 37,
    // so this BOM is intentionally pinned to the last API-36-compatible stable line.
    val composeBom = platform("androidx.compose:compose-bom:2026.06.00")

    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.19.0")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    implementation("androidx.webkit:webkit:1.17.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
