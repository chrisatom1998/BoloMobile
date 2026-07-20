# Public store submission checklist

Complete the owner-controlled items first; the store records cannot be finalized honestly without them.

## Publisher inputs

- [ ] **REQUIRED_OWNER_INPUT:** Choose permanent iOS bundle and Android package identifiers under a namespace the publisher controls. Confirm them before creating either store record.
- [ ] **REQUIRED_OWNER_INPUT:** Supply the publisher's legal display name and copyright owner, and confirm rights to the Bolo name, lesson copy, fonts, artwork, and all included content.
- [ ] **REQUIRED_OWNER_INPUT:** Supply a monitored privacy/support email for the store records and the operational support queue. Public privacy, support, and terms pages are already hosted and must continue to match production data practices.
- [ ] **REQUIRED_OWNER_INPUT:** Confirm AppDeploy and OpenAI production terms, retention and deletion behavior, service-provider status, security controls, content safeguards, and the complete encrypted transit path. Reconcile the store privacy declarations after that review.
- [ ] **REQUIRED_OWNER_INPUT:** Supply Apple Developer/App Store Connect and Google Play Console ownership, agreements, tax or trader-status information, and secure submission credentials. Do not commit credentials to the repository.
- [ ] **REQUIRED_OWNER_INPUT:** Supply Apple's app-review contact first name, last name, monitored email, and phone number.
- [ ] **REQUIRED_OWNER_INPUT:** Confirm that the phone-only iOS scope for Bolo 1.0 is intentional. Re-enabling iPad later requires layout testing and 13-inch iPad screenshots.
- [ ] **REQUIRED_OWNER_INPUT:** Confirm price, countries or regions, and the recommended 13+ target audience.

## Shared preflight

- [ ] Verify the final app name and permanent identifiers match the binary and both store records.
- [ ] Open the public privacy and support URLs in a signed-out browser; confirm no authentication, edit permission, or PDF download is required.
- [ ] Capture screenshots from the shipping builds according to `store/assets.json`; do not use mock screens or personal conversation content.
- [ ] Test on physical Android and iOS devices: consent v5, typed and completed voice history across End/leave/relaunch, confirmed Clear chat with the welcome retained, AI Listen playback with no device-reader fallback, confirmation that tapping the voice orb requests microphone permission and opens a WebRTC media stream, microphone transmission from the first orb tap through the second send tap, the disabled track between turns, stream release at End/leave/background, confirmation that live voice does not create a recording file or capture microphone audio in the background, pronunciation cancellation on background and the 15-second stop, English/Hindi reply selection, reporting, consent withdrawal, airplane mode, timeout, and relaunch.
- [x] Production backend implements `/api/realtime-token`, binds `OpenAI-Safety-Identifier`, returns only short-lived `ek_` client secrets, rejects arbitrary model selection, persistently rate-limits token minting, and never exposes the standard OpenAI API key. Source and deployment verified July 14, 2026.
- [ ] Confirm the production backend has enforceable rate limits, abuse controls, moderation, monitoring, and an operational response path for reported AI replies.
- [ ] Run the complete project verification, Expo diagnostics, native configuration inspection, and production exports immediately before building.

## App Store Connect

- [ ] Create the app record with the permanent bundle ID, primary language, and unique SKU.
- [ ] Use Education as primary category and Travel as secondary category.
- [ ] Complete the updated age questionnaire: Made for Kids = No; Infrequent Medical or Treatment Information = Yes; answer every other descriptor from the shipping build.
- [ ] Enter the listing copy and review notes from `store/listings.json`.
- [ ] Enter the privacy-policy and support URLs, copyright, app-review contact, and any required trader information.
- [ ] Complete App Privacy using `store/privacy-declarations.md`, updated for the verified production providers.
- [ ] Upload one to 10 iPhone screenshots. Bolo 1.0 has iPad support disabled.
- [ ] Confirm export compliance matches the build, select the build, and answer content-rights questions.
- [ ] Test the exact archive through TestFlight before review. Keep release manual and enable phased release after approval.
- [ ] Ensure the upload was built with Xcode 26 or later and the iOS 26 SDK or later, as required for uploads since April 28, 2026.

## Google Play Console

- [ ] Create the app record with the permanent package name and default English (United States) listing.
- [ ] Upload an Android App Bundle to Internal testing first; enable Play App Signing and run the pre-launch report.
- [ ] Enter the listing copy from `store/listings.json` and upload the 512×512 icon, 1024×500 feature graphic, and at least four 1080×1920 phone screenshots from `store/assets.json`.
- [ ] Complete Data safety from `store/privacy-declarations.md`, updated for production providers.
- [ ] Complete App access (no credentials), Ads (no), Content rating, Target audience (13+), News, Health apps, and any other App content declarations shown by Play Console.
- [ ] Confirm the AI reply Report action works in the uploaded build and that reports are reviewed; this is required for generative-AI apps.
- [ ] Verify the AAB meets Google's target API rule at upload time; new apps and updates must target a level within one year of the latest major Android release.
- [ ] If the publisher uses a personal Play account created after November 13, 2023, complete a closed test with at least 12 opted-in testers for 14 continuous days and obtain production access.
- [ ] Roll out to a small production percentage first, monitor Android vitals and reports, then expand deliberately.

## After submission

- [ ] Monitor review messages and answer with the exact review path in `store/listings.json`.
- [ ] Monitor crashes, backend errors, provider usage, safety reports, and store reviews during rollout.
- [ ] Update privacy disclosures and policy before shipping any change to data collection, providers, SDKs, account behavior, or AI features.
