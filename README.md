# A-Store

**A for Aryan, A for Apps — Made by Aryan.**

This repository contains only the A-Store website and A-Store Android app. The original Griffiti website is not included or deployed here.

## Repository layout

```text
A-Store/
├── docs/                 # A-Store website (GitHub Pages publishing folder)
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── .nojekyll
├── app/                  # Cordova Android project
│   ├── www/               # Android app interface
│   ├── config.xml
│   ├── package.json
│   ├── cordova-plugins/astore-download/  # Native Android downloader + APK installer hand-off
│   ├── res/               # Launcher icon and native splash artwork
│   └── build-apk.bat
├── build-apk.bat         # One-command Windows build shortcut
└── README.md
```

## 1. Publish the A-Store website on GitHub Pages

1. Create a **new public GitHub repository** named `A-Store` under your GitHub account.
2. Upload the contents of this folder to the repository root. Keep the `docs`, `app` and other folders in their current positions.
3. Open the repository's **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch **main** and folder **/docs**, then click **Save**.
6. GitHub Pages will publish the website at:

   `https://griffith4421.github.io/A-Store/`

   This address assumes your GitHub username is `Griffith4421` and the repository is named exactly `A-Store`. GitHub Pages may take a few minutes to publish the first deployment.

The Android source is stored in `app/` but is not part of the published website because GitHub Pages publishes only `/docs`.

## 2. Firebase setup

The site and Android app are configured to use the existing Firebase web project (`griffiti-portfolio`) so your existing Firestore content can be reused. This does **not** deploy or publish the original Griffiti website.

- `docs/js/config.js` and `app/www/js/config.js` contain the browser-side Firebase configuration used by the two frontends. They must be committed to GitHub for this exact package to work. These are public client configuration values, not service-account credentials.
- Add `griffith4421.github.io` to **Firebase Console → Authentication → Settings → Authorized domains** if Google sign-in is used on the website. Add any custom domain there too.
- Keep Firestore Security Rules as the actual security boundary. Never place service-account JSON, private keys or admin SDK credentials in this repository.
- The website's Studio and Android app expect the existing Cloudinary upload configuration and Firebase data model to remain available. The Android app is browse-focused; publishing/admin editing is done through the website Studio.
- Do not deploy Firestore rules/indexes just because this site is being published. Review the existing Firebase project's live rules and indexes first; hosting A-Store does not require replacing them.

## 3. Build the Android APK with one command (Windows)

### Install the build prerequisites once

Install these tools before the first build:

1. **Node.js 22.9+** (or 20.17+): <https://nodejs.org/en/download>
2. **JDK 17**: <https://adoptium.net/temurin/releases/?version=17>
3. **Android Studio**: <https://developer.android.com/studio>
4. In Android Studio's SDK Manager install **Android SDK Platform 36**, **Android SDK Build-Tools 36.0.0**, **Android SDK Platform-Tools**, and **Android SDK Command-line Tools (latest)**.

Set Windows environment variables:

- `JAVA_HOME` = your JDK 17 installation folder (the folder containing `bin\javac.exe`).
- `ANDROID_HOME` = your Android SDK folder, commonly `%LOCALAPPDATA%\Android\Sdk`.

Close and reopen Command Prompt after changing environment variables.

### Build

Extract/clone the repository. Open Command Prompt in the repository folder and run this **single command**:

```bat
build-apk.bat
```

The script automatically installs the project's Node dependencies, adds Cordova Android 15.1.0, InAppBrowser and the local A-Store DownloadManager plugin when needed, checks the Android toolchain, builds the app, and copies the result to:

`dist\A-Store-debug.apk`

The same script is also available inside `app/` as `app\build-apk.bat`.

### App downloads and APK installation

- In the website Studio, create/edit an app and provide a **direct HTTPS download URL**. For an Android package, the URL should point directly to an `.apk` file (a GitHub Release asset or direct file-hosting URL is suitable; a repository page or sharing preview page is not).
- Set **Download type** to **Android APK**. The shared Firestore record carries this URL/type to both the website and Android app in real time.
- The website's **Download** buttons open the file link in the browser. Actual browser download behavior depends on the file host's response headers.
- The Android app uses Android's system Download Manager for direct files, shows download progress, and changes the button to **Install** when the APK is ready. The first install may ask you to allow A-Store to install unknown apps in Android Settings. Return to A-Store and tap **Install** again.
- Android deliberately requires user confirmation; A-Store never silently installs another app. Keep APK links on HTTPS and only publish APKs you trust.
- Choose **Website / web app link** for an app that should open a web page rather than download a package. ZIP and other file types are downloaded to the Android Downloads folder but are not treated as installable APKs.

The native downloader source is in `app/cordova-plugins/astore-download/`. It relies on Android's DownloadManager and the system package installer; no deprecated file-opener plugin is used.

The output is a **debug-signed APK for testing**. It can be installed on your Android device, but it is not a Play Store release. For public distribution, create and safely back up your own signing keystore, then create a signed release APK/AAB. Never commit the keystore or passwords to GitHub.

## 4. Android app identity

- App name: `A-Store`
- Application ID: `com.aryan.astore`
- Version: `1.1.0`
- Minimum Android version: Android 7.0 (API 24), matching Cordova Android 15.1.0 support.

Changing the application ID after you distribute the app creates a different Android app. Keep it stable after release.

## 5. Updates

- Website changes: edit files in `docs/` and push to `main`; GitHub Pages publishes the update.
- App interface changes: edit files in `app/www/`, then run `build-apk.bat` to generate a new APK.
- Shared content: Firebase real-time data changes can appear in both interfaces without rebuilding the APK, provided both are connected to the same Firebase project.

The website and Android app have separate designs. They share content/backend data, not their source code or layout.
