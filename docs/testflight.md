# TestFlight builds from GitHub

The **iOS app** workflow (`.github/workflows/ios-testflight.yml`) builds the
MoonTea iPhone/iPad app on a Mac in GitHub, so you don't need Xcode to ship a
new version.

- **On every pull request** that changes `MoonTea/`, it compiles the app (no
  signing, no upload). A PR that doesn't build gets a red X.
- **When you press Run workflow**, it builds, signs and uploads a new version
  to TestFlight. Nothing uploads unless you press the button.

## Before the first upload

1. The team that owns the app (team `72SUFN94L2` in Xcode) has the **paid
   Apple Developer Program**.
2. App Store Connect has an app for bundle ID **`ntl.MoonTea`**
   (App Store Connect → Apps → **+** → New App).

## Secrets to add

Add each one on GitHub: the repo → **Settings** → **Secrets and variables** →
**Actions** → **New repository secret**. Type the name exactly as shown.

| Name | What it is |
| --- | --- |
| `ASC_KEY_ID` | App Store Connect API key ID |
| `ASC_ISSUER_ID` | App Store Connect issuer ID |
| `ASC_KEY_P8` | The API key file's contents |
| `APP_SECRETS_SWIFT` | Your whole `Secrets.swift` file |
| `EPSON_SDK_ZIP_URL` | Download link to a zip of the Epson printer SDK |

### 1. App Store Connect API key (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`)

1. Go to App Store Connect → **Users and Access** → **Integrations** →
   **App Store Connect API** → **Team Keys**.
2. Press **+** (Generate API Key). Name it `GitHub Actions` and give it
   **Admin** access. Admin is what lets Xcode create the App Store signing
   certificate and profile by itself, so you don't have to export any
   certificates from your Mac.
3. Press **Download API Key**. Apple only lets you download it once, so keep
   the `AuthKey_XXXXXXXXXX.p8` file somewhere safe.
4. `ASC_KEY_ID`: the **Key ID** shown in the key's row (10 characters).
5. `ASC_ISSUER_ID`: the **Issuer ID** shown above the list of keys.
6. `ASC_KEY_P8`: open the `.p8` file in TextEdit and copy all of it, including
   the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines.

### 2. App secrets (`APP_SECRETS_SWIFT`)

`MoonTea/MoonTea/Config/Secrets.swift` isn't in the repo (it's git-ignored).
On the Mac where you build the app today, open that file, copy everything in
it and paste it as the secret's value.

### 3. Epson printer SDK (`EPSON_SDK_ZIP_URL`)

The Xcode project uses Epson's `libepos2.xcframework`, which only lives on your
Mac (`MoonTea/MoonTea/ePOS_SDK_iOS_v2.37.0/`). This repo is public, so the SDK
shouldn't be committed here: it's Epson's licensed software. Instead the
workflow downloads it from a private link:

1. In Finder, open `MoonTea/MoonTea/ePOS_SDK_iOS_v2.37.0`, right-click
   `libepos2.xcframework` and choose **Compress**. You get
   `libepos2.xcframework.zip`.
2. In the Supabase dashboard → **Storage**, make a new bucket (leave
   **Public** off) and upload the zip.
3. Click the uploaded file → **Get URL**, pick a long expiry (for example 1
   year) and copy the link.
4. Paste that link as `EPSON_SDK_ZIP_URL`.

Any direct-download link to the zip works. When the link expires, make a new
one and update the secret.

## Uploading a new version

1. Merge the changes you want into `master`.
2. On GitHub, open **Actions** → **iOS app** → **Run workflow**.
3. Leave the branch as `master`. Optionally type a **version** (like `1.1`);
   blank keeps the version set in Xcode. Leave **build number** blank.
4. Press **Run workflow**.

When the run turns green, the build shows up in App Store Connect →
**TestFlight** after Apple finishes processing it. From there you add testers
or submit it to the App Store.

The first time, App Store Connect asks an export compliance (encryption)
question before testers can install. Answer it there, or add
`ITSAppUsesNonExemptEncryption` = `NO` to `Info.plist` if the app only uses
HTTPS, so it stops asking.

## If a run fails

- **"bundle version must be higher"**: a build with that number already exists.
  Run again and type a bigger number in **build number**.
- **Signing or "cloud signing" permission errors**: the API key needs **Admin**
  access. Make a new key with Admin and update the three `ASC_` secrets.
- **"no devices" when making a profile**: register an iPhone to the team once,
  for example by running the app on it from Xcode.
- **A secret is missing**: the run says which one. Add it and run again.

## Heads-up about the Square access token

`Secrets.swift` puts the Square access token inside the app. Anything built
into an app can be dug back out of it, so anyone who can install the app from
TestFlight could get that token. Only invite testers you trust. The safer
long-term fix is to make the Square calls that need the token from a server
(for example a Supabase Edge Function) instead of from the app.
