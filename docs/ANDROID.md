# PWV Insights for Android

This document covers building, testing, and publishing the PWV Insights Android app to the Google Play Store.

## Prerequisites

- Node.js 18+ and npm
- [Android Studio](https://developer.android.com/studio) (latest stable)
- Java Development Kit (JDK) 17 or later
- A Google Play Console account ($25 one-time fee)

## App Configuration

- **App ID**: `org.gennetten.pwvinsights`
- **App Name**: PWV Insights
- **Target SDK**: 36 (Android 16)
- **Min SDK**: 24 (Android 7.0)

## Build Steps

### 1. Install Dependencies and Build Web Assets

```bash
npm install
npm run build
```

This creates the `dist/` folder with the production web build.

### 2. Sync Capacitor

```bash
npx cap sync android
```

This copies the web assets to the Android project and updates native dependencies.

### 3. Open in Android Studio

```bash
npx cap open android
```

Or manually open the `android/` folder in Android Studio.

### 4. Build APK/AAB

#### Debug APK (for testing)

In Android Studio:
1. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
2. The APK will be generated in `android/app/build/outputs/apk/debug/`

Or via command line:
```bash
cd android
./gradlew assembleDebug
```

#### Signed AAB (for Play Store)

1. **Generate a Signing Key** (first time only):
   ```bash
   keytool -genkey -v -keystore pwv-insights-release.keystore \
     -alias pwv-insights -keyalg RSA -keysize 2048 -validity 10000
   ```
   
   Store the keystore file and password securely. You'll need them for every release.

2. **Configure Signing** in Android Studio:
   - **Build → Generate Signed Bundle / APK**
   - Select **Android App Bundle**
   - Choose existing keystore or create new
   - Select the `release` build variant

3. The signed AAB will be in `android/app/build/outputs/bundle/release/`

Or configure `android/app/build.gradle`:
```gradle
android {
    ...
    signingConfigs {
        release {
            storeFile file("/path/to/pwv-insights-release.keystore")
            storePassword "YOUR_KEYSTORE_PASSWORD"
            keyAlias "pwv-insights"
            keyPassword "YOUR_KEY_PASSWORD"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            ...
        }
    }
}
```

Then build:
```bash
cd android
./gradlew bundleRelease
```

## Testing

### Local Device Testing

1. Enable **Developer Mode** on your Android device
2. Enable **USB Debugging** in Developer Options
3. Connect device via USB
4. In Android Studio: **Run → Run 'app'**

### Testing Background GPS

1. Install the debug APK on a device
2. Open Data Logger and start a patrol
3. Lock the screen or switch to another app
4. The persistent notification should show "Recording GPS track"
5. Unlock and return to the app to verify the track continued recording

### Permissions Testing

The app requests:
- **Location (Fine)**: Required for GPS tracking
- **Location (Background)**: Implicit via foreground service (no separate runtime permission on API 29+)
- **Notifications**: Required for the foreground service notification (Android 13+)

Test that:
- Location permission prompt appears on first GPS use
- Notification permission prompt appears (Android 13+)
- Denying permissions shows appropriate messages
- The foreground service notification persists while tracking

## Google Play Console Setup

### 1. Create a Google Play Developer Account

- Go to [https://play.google.com/console](https://play.google.com/console)
- Pay the $25 one-time registration fee
- Complete identity verification (government ID + proof of address for US individuals)

### 2. Create a New App

1. **Create app** → **PWV Insights**
2. **Default language**: English (United States)
3. **App or game**: App
4. **Free or paid**: Free
5. **Declarations**: Accept terms

### 3. Set Up App Content

#### Privacy Policy

- **URL**: `https://pwv-insights.gennetten.org/privacy`
- The app includes a `/privacy` route with a comprehensive privacy policy

#### Data Safety Form

Declare the following data collection:

**Location**
- **Approximate location**: No
- **Precise location**: Yes
  - **Purpose**: App functionality (GPS tracking for patrol routes)
  - **Data is collected**: Yes
  - **Data is shared**: No (data stays within PWV organization)
  - **Data is ephemeral**: No
  - **Data collection is optional**: No (required for core feature)

**Photos and videos**
- **Photos**: Yes
  - **Purpose**: App functionality (patrol documentation)
  - **Data is collected**: Yes
  - **Data is shared**: No
  - **Data is ephemeral**: No
  - **Data collection is optional**: Yes (users can skip photo capture)

**Personal info**
- **Name**: Yes
- **Email address**: Yes
  - **Purpose**: Account management, App functionality
  - **Data is collected**: Yes
  - **Data is shared**: No
  - **Data is ephemeral**: No
  - **Data collection is optional**: No

**App activity**
- **App interactions**: Yes (patrol reports, trail logs)
  - **Purpose**: App functionality, Analytics
  - **Data is collected**: Yes
  - **Data is shared**: No
  - **Data is ephemeral**: No
  - **Data collection is optional**: No

**Security Practices**
- Data is encrypted in transit (HTTPS)
- Data is encrypted at rest (server-side)
- Users can request deletion: Yes (`/account-deletion` page)

#### Content Rating

Complete the IARC questionnaire:
- **App category**: Reference/informational
- **No objectionable content** (no violence, alcohol, gambling, etc.)
- Expected rating: **Everyone** or **PEGI 3**

#### Target Audience

- **Target age**: 18 and older (volunteer organization)

#### App Access

**Instructions for reviewers**:
```
PWV Insights requires a member account. For review purposes, use this trial link:

[Generate a 7-day trial link from Admin → Trial Links and paste the full URL here]

The trial account provides full access to the Data Logger feature, which demonstrates the background GPS tracking and foreground service notification.

To test background GPS tracking:
1. Open the app using the trial link
2. Navigate to "Data Logger" (bottom navigation)
3. Tap "Start" to begin tracking
4. A persistent notification "Recording GPS track" will appear
5. Lock the screen or switch to another app
6. The GPS tracking continues in the background
7. Return to the app and tap "Stop" to end tracking

All features are accessible without additional credentials.
```

### 4. Background Location Declaration

Apps using background location must provide:

1. **Feature video** (required) showing:
   - User starting a patrol track in the Data Logger
   - The foreground service notification appearing
   - Switching away from the app or locking the screen
   - The notification persisting
   - Returning to the app to see the continued track

   Record a 30-second screen recording demonstrating this flow.

2. **Declaration form**:
   - **Feature name**: Patrol GPS Tracking
   - **What is the core user-facing feature?**: Recording GPS tracks during wilderness patrol
   - **Why is background location necessary?**: Volunteers patrol for extended periods (2-8 hours) and need continuous location tracking while the screen is off to conserve battery
   - **How does the app use background location?**: A foreground service with a persistent notification records the user's GPS path while they patrol trails

### 5. App Release

#### Internal Testing (Optional)

1. **Testing → Internal testing**
2. Add testers by email
3. Upload the signed AAB
4. Testers receive a link to install the app

#### Closed Testing (Required for New Personal Accounts)

**New personal accounts (created after Nov 13, 2023) require:**
- At least **12 testers** continuously opted in
- Running the closed test for **14 consecutive days**
- Then apply for production access

Steps:
1. **Testing → Closed testing → Create new release**
2. Upload the signed AAB
3. Add release notes
4. **Testers** tab → Create email list → Add ≥12 testers
5. Share the opt-in link with testers
6. Wait 14 days
7. **Apply for production** (button appears after 14 days)

#### Production Release

1. **Production → Create new release**
2. Upload the signed AAB
3. Set rollout percentage (start with 20%, increase gradually)
4. Submit for review
5. Review typically takes **3-7 days**

## Post-Release

### App Updates

1. Increment `versionCode` in `android/app/build.gradle`:
   ```gradle
   defaultConfig {
       ...
       versionCode 2
       versionName "1.1"
   }
   ```

2. Build a new signed AAB
3. Upload to the same Production track
4. Submit for review

### Play App Signing

Google manages the signing key for AAB uploads. To configure Digital Asset Links for TWA (if needed later):

1. **Setup → App signing**
2. Copy the **SHA-256 certificate fingerprint** from "App signing key certificate"
3. Add to `public/.well-known/assetlinks.json` on your web server:
   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "org.gennetten.pwvinsights",
       "sha256_cert_fingerprints": ["XX:XX:..."]
     }
   }]
   ```

## Troubleshooting

### Build Fails

- **Clean and rebuild**: `cd android && ./gradlew clean && ./gradlew build`
- **Invalidate caches**: Android Studio → **File → Invalidate Caches / Restart**
- **Sync Gradle files**: **File → Sync Project with Gradle Files**

### Background GPS Not Working

- Check that `android/app/src/main/AndroidManifest.xml` declares:
  - `FOREGROUND_SERVICE`
  - `FOREGROUND_SERVICE_LOCATION`
  - `ACCESS_FINE_LOCATION`
  - `POST_NOTIFICATIONS` (Android 13+)
- Verify the plugin is added: `npx cap ls` should show `@capacitor-community/background-geolocation`
- Check device Battery Saver settings (may restrict background location)

### App Rejected for Background Location

- Ensure the **feature video** clearly shows the foreground notification
- Update the declaration form with specific details about patrol use case
- Provide detailed reviewer instructions with a working trial link

## Resources

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Capacitor Android Configuration](https://capacitorjs.com/docs/android/configuration)
- [Background Geolocation Plugin](https://github.com/capacitor-community/background-geolocation)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [Android Developer Guide](https://developer.android.com/guide)
- [Play Store Testing Requirements](https://support.google.com/googleplay/android-developer/answer/14151465)

## Backend Considerations

The Android app makes API calls to `https://pwv-insights.gennetten.org/api/` from the origin `https://localhost` (Capacitor's default `androidScheme`).

**CORS Status**: The PHP backend already sends `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Headers: Content-Type` on all endpoints, and returns `204` on `OPTIONS` preflight requests. This works correctly for the Android app - no backend changes are needed.

**Auth**: The app sends the authentication token in the JSON request body (not in cookies or headers), so no credential or SameSite cookie configuration is required.

**Deploy script**: Ensure `scripts/deploy.mjs` doesn't delete any future `.well-known/assetlinks.json` if you later add Digital Asset Links for TWA/App Links.

