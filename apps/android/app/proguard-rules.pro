# NekoAnimes release shrinking rules.
# Prefer SDK consumer ProGuard rules; keep only app-level contracts that cross
# reflection/serialization boundaries.

-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# org.json payloads are exchanged with the WebView bridge as explicit strings;
# bridge entrypoints are called by AndroidX WebKit and must retain their members.
-keep class com.nekoanimes.app.bridge.** { *; }

# Playback descriptor models are decoded by explicit JSONObject access today.
# Keep their Kotlin metadata stable for future serializers without exposing other code.
-keep class com.nekoanimes.app.player.PlaybackDescriptor { *; }
-keep class com.nekoanimes.app.player.PlaybackSource { *; }

# Strip verbose Android logging from release where R8 can prove calls removable.
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
}
