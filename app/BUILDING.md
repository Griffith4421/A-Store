# Building A-Store Android

From the repository root, run `build-apk.bat`.

Prerequisites: Node.js 22.9+ (or 20.17+), JDK 17, Android SDK Platform 36, Build Tools 36.0.0, Platform Tools and Android SDK Command-line Tools. Set `JAVA_HOME` and `ANDROID_HOME` before building.

The script produces `dist/A-Store-debug.apk`. This is a debug build for testing, not a signed production release.

## Download and install behavior

The local Cordova plugin at `cordova-plugins/astore-download` uses Android DownloadManager for direct HTTPS file URLs. APK downloads are stored in the device Downloads folder, their status is polled by the app, and the completed job exposes an Install button that launches Android's package installer. Android may first require the user to enable “Allow from this source” for A-Store under Install unknown apps. After granting it, return to A-Store and tap Install again. This is a user-confirmed Android flow, not silent installation.

For an app to install from A-Store, its shared Firestore record must contain a direct HTTPS APK URL and `downloadType: "apk"`. A link to a repository page or cloud-file preview is not a direct APK file.
