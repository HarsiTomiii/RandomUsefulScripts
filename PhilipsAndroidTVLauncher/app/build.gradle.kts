import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Jellyfin connection for the "Continue watching" row; see jellyfin.properties.example.
val jellyfin = Properties().apply {
    rootProject.file("jellyfin.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}

android {
    namespace = "com.harsitomiii.tvlauncher"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.harsitomiii.tvlauncher"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "0.1"

        buildConfigField("String", "JELLYFIN_URL", "\"${jellyfin.getProperty("url", "")}\"")
        buildConfigField("String", "JELLYFIN_API_KEY", "\"${jellyfin.getProperty("apiKey", "")}\"")
        buildConfigField("String", "JELLYFIN_USER", "\"${jellyfin.getProperty("user", "")}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            // Signed with the debug key so it can be sideloaded without a keystore.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}
