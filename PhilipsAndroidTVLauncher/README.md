# PhilipsAndroidTVLauncher

A minimal home screen for a Philips Google TV (OLED708, Android 14). It replaces Google TV's ad- and recommendation-heavy home with:

- two large tiles (Wholphin, YouTube), a small Steam Link tile and an **All apps** grid
- a **Switch profile** button that opens Google TV's own profile chooser
- a **Continue watching** row from Jellyfin (resume + next up for one user); selecting an item starts it in Wholphin as that user
- a **Movies you haven't seen** row: random unwatched Jellyfin movies, reshuffled at most hourly; selecting one opens its page in Wholphin

Picture, sound, Ambilight, inputs and settings are untouched — they stay on the remote's own buttons.

## Requirements

- JDK 17 and the Android SDK (platform 34, build-tools 34) — `sdk.dir` in `local.properties`
- `adb` (`android-tools`), with **Wireless debugging** or **Network debugging** enabled on the TV
- [Wholphin](https://github.com/damontecres/Wholphin) on the TV for the Jellyfin row

## Setup

1. Copy `jellyfin.properties.example` to `jellyfin.properties` and fill in the server URL, an API key (Jellyfin dashboard → API keys) and the user name. The file is git-ignored; without it the Jellyfin row is hidden.
2. Build and install:

   ```bash
   ./gradlew assembleDebug
   adb connect <tv-ip>:5555
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

3. Make it the home screen:

   ```bash
   scripts/home.sh enable    # scripts/home.sh disable to go back to the stock home
   ```

   Run `scripts/home.sh enable` again after every reinstall: Android keeps the updated service bound but stops sending it the Home key until it is switched off and on.

## How it becomes the home screen

Google TV ignores the Android HOME role, so `home.sh enable` also turns on `HomeKeyService`, an accessibility service in the app:

- a short press of Home opens this launcher; holding Home still opens Google TV's side panel
- whenever the stock home screen comes up (boot, an app exiting, leaving the profile chooser) it is replaced by this launcher

The stock launcher is never disabled: the profile chooser and side panel live in it. Other accessibility services (e.g. Button Mapper) are left as they are.

## Customising

Which apps get tiles, and their colours, is in [`Config.kt`](app/src/main/java/com/harsitomiii/tvlauncher/Config.kt).
