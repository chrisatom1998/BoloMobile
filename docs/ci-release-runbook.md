# CI and iOS release runbook

This runbook separates merge checks, nightly staging acceptance, signed artifact inspection, TestFlight upload, and physical-device approval. Repository administrators must complete the settings below before treating the workflows as release gates.

## Required checks on `main`

Create an active branch ruleset for `main`. Require a pull request, require the branch to be up to date, dismiss stale approvals, require conversation resolution, and block force pushes and deletion. Require the single status check `required-checks` by its exact context name.

`required-checks` uses `if: always()` and fails unless all nine merge jobs report `success`: `verify`, `website`, `expo-doctor`, `ios-prebuild`, `production-config`, `ios-native-build`, `android-native-build`, `maestro-smoke`, and `security`. The Android native job regenerates the project from Expo config and compiles a Release APK. This aggregate is intentionally fail-closed: a failed prerequisite that skips a downstream native job cannot be reported as an acceptable skipped required check.

Do not add CodeQL, the scheduled nightly workflow, release preflight, TestFlight upload, or physical signoff as required merge checks. A sole owner cannot satisfy an independent approval rule; add a trusted reviewer before requiring one approval or preventing self-approval.

In **Settings → Actions → General**, set the default `GITHUB_TOKEN` permission to read-only, leave “Allow GitHub Actions to create and approve pull requests” disabled, and require approval for workflows from outside collaborators. Where the account plan permits, allow only GitHub-authored actions and explicitly approved third-party actions. Workflow actions are pinned to verified full commit SHAs with their release tags in comments; review and merge Dependabot SHA-update PRs rather than restoring moving tags.

`expo-doctor` is an exact root development dependency and both CI and release preflight invoke it with `npx --no-install`. Update the manifest and lockfile together after reviewing a specific version; never restore `@latest` or another moving resolver in a release gate.

## Dependency security

In **Settings → Advanced Security**:

1. Enable Dependency graph.
2. Enable Dependabot alerts.
3. Enable Dependabot security updates.
4. Keep `.github/dependabot.yml` on the default branch to enable weekly version updates for the root app, website, and GitHub Actions.

Expo, React, and React Native updates are grouped because their versions are coupled. Never merge that group only because the lockfile resolves: require the normal checks and review it against the exact Expo SDK 57 documentation.

### CodeQL and dependency review availability

This is a private repository owned by a personal account. GitHub Code Security/Advanced Security may not be available for that combination. Leave repository variable `ENABLE_CODEQL` absent or set to `false` unless **Settings → Advanced Security** confirms Code Security is enabled. The CodeQL job then skips without attempting a SARIF upload.

If Code Security becomes available:

1. Enable Code Security.
2. Choose the checked-in advanced CodeQL workflow; do not also enable default setup.
3. Set repository variable `ENABLE_CODEQL=true`.
4. Enable dependency review and retain its high/critical merge policy in the `security` aggregate check.

If Code Security is unavailable, the `security` job still evaluates both `npm audit --omit=dev` and the full dependency tree against the checked-in, expiring advisory baseline, plus the secret scan. Any new high/critical runtime, development, or build-time advisory fails. The two existing `image-size` advisories remain warning-level only while their severity, non-direct status, installed node, and sole `metro` dependent exactly match the reviewed build-path fingerprint. The gate also rejects adding `image-size` to a root runtime dependency field or importing it from JavaScript/TypeScript source under `src`; a new runtime path carrying the same GHSA therefore fails. Baseline review dates must be real dates no more than 90 days away. Do not mark CodeQL as required. Moving the repository to an eligible organization is the normal route to private-repository Code Security.

If GitHub Secret Protection is licensed, enable native secret scanning and push protection under **Settings → Advanced Security**. The workflow secret scanner remains useful for history and custom patterns, but it runs after a push and is not a substitute for push protection. Rotate a detected credential even if it is later removed from Git history.

## EAS staging environment

In the Expo project’s **preview** environment, define:

- `BOLO_API_URL`: HTTPS staging API URL.
- `BOLO_PUBLIC_SITE_URL`: HTTPS staging public-site URL.
- `BOLO_APP_IDENTIFIER`: `com.bolo.hindi` unless the checked-in Maestro flows are intentionally parameterized together.
- `BOLO_EAS_PROJECT_ID`: the linked EAS project UUID.
- `BOLO_EXPO_OWNER`: the publishing Expo account.

The two staging URLs must be present and must differ from the production API and site. The nightly workflow refuses the checked-in production defaults before running any live test. It then runs the deployed-policy validator, the bounded live-service acceptance passes, builds the unsigned `staging-e2e` Simulator app, and executes the iOS smoke flow 00 plus flows 02–05.

Flow 01 is deliberately excluded from iOS nightly execution because `setAirplaneMode` is an Android-only Maestro command. It remains statically covered by `e2e:validate` and should run in the Android E2E lane. Simulator voice flows may take the “physical iPhone required” branch, so actual WebRTC microphone turns remain a release signoff item.

The PR smoke job downloads Maestro CLI 2.8.0 over HTTPS and verifies the vendor-published `checksums_sha256.txt` digest before extraction. When updating Maestro, review the signed GitHub release, replace both `MAESTRO_VERSION` and `MAESTRO_SHA256`, and verify the new asset locally before merging.

The EAS nightly job also pins `maestro_version: 2.8.0`; do not restore Expo's moving `latest` default. Its manual trigger must remain the schema-valid object form `workflow_dispatch: {}`.

## GitHub release variables and environments

Create these repository variables:

- `BOLO_APP_IDENTIFIER=com.bolo.hindi`
- `BOLO_EAS_PROJECT_ID=<EAS project UUID>`
- `BOLO_EXPO_OWNER=<Expo owner>`
- `PRODUCTION_API_URL=<production HTTPS API URL>`
- `PRODUCTION_PUBLIC_SITE_URL=<production HTTPS public-site URL>`
- `STAGING_API_URL=<staging HTTPS API URL>`
- `STAGING_PUBLIC_SITE_URL=<staging HTTPS public-site URL>`
- `IOS_MAX_IPA_BYTES=<absolute compressed IPA budget>`
- `IOS_MAX_EXPANDED_APP_BYTES=<absolute expanded Payload app budget>`
- `IOS_IPA_BASELINE_BYTES=<last owner-approved IPA byte count>`
- `IOS_MAX_GROWTH_PERCENT=15`

All byte values and the growth percentage must be positive integers. Bootstrap the baseline from a trusted signed reference build, then update `IOS_IPA_BASELINE_BYTES` only after accepting a deliberate size increase. The inspection report records both measured sizes and the calculated baseline limit. IPA size is a regression/upload metric, not the final App Store device-download size; review App Store Connect’s processed size too.

Create GitHub environment `ios-release`, restrict deployments to `main`, and add these environment secrets:

- `EXPO_TOKEN`
- `BOLO_PUBLISHER_NAME`
- `BOLO_SUPPORT_EMAIL`
- `BOLO_REVIEW_FIRST_NAME`
- `BOLO_REVIEW_LAST_NAME`
- `BOLO_REVIEW_EMAIL`
- `BOLO_REVIEW_PHONE`

The EAS production environment must contain matching production identity/endpoints and any build-time secrets. EAS environment values and GitHub environment values are separate stores.

This repository is private and owned by a personal account. Do not treat an environment name in workflow YAML as proof of a human approval gate: on plans that do not support required reviewers for private repositories, GitHub cannot enforce that reviewer, and referencing a missing environment creates it without protection. Here, `ios-release` scopes secrets and restricts deployment to `main`; the manual workflow dispatch is the release-start authorization. If the repository moves to a plan and ownership model that supports private-repository required reviewers, add one there as an additional gate.

GitHub release secrets are step-scoped: metadata validation, EAS build, build lookup, and submission receive only the credentials they need. Do not move them back to the release job-level environment, where checkout, setup, dependency installation, and artifact-inspection steps could read them.

Physical-iPhone approval is recorded after testing through the separate **Record iOS physical signoff** workflow. This two-stage dispatch remains available on a private personal repository and cannot be auto-approved merely because a preceding release job succeeded.

## Dispatching an iOS release

Open **Actions → Release iOS → Run workflow**, select `main`, and initially leave `submit_to_testflight` false. The workflow:

1. Requires `main`, explicit production endpoints, checked-in production/full-tree advisory baselines with exact dependency-path fingerprints, a blocking website runtime audit, warning-only diagnostic output for accepted root build-path advisories and website development dependencies, project verification, static Maestro validation, Expo Doctor/export, deployed-policy validation, and live backend acceptance.
2. Enters the `ios-release` environment, which scopes release secrets and restricts deployment to `main`. It pauses for a reviewer only if the repository's plan actually supports and configures that protection.
3. Runs release metadata validation and starts an EAS production build with frozen credentials.
4. Downloads the exact EAS build by ID over HTTPS-only redirects and rejects a malformed, unsigned, development-signed, wrongly identified or unversioned, unexpectedly entitled, privacy-manifest-free, permission-copy-free, oversized, staging-linked, or credential-bearing IPA. It explicitly verifies the main app, extensions, and every embedded `.framework` signature.
5. Uploads only inspection metadata to GitHub. The signed IPA remains in EAS and is not copied into GitHub artifacts.
6. Optionally submits that exact inspected EAS build ID to TestFlight.
7. If submitted, prints the exact commit and EAS build ID plus a link to the separate physical-signoff workflow. It does not claim that device testing passed.

Never use “latest” for release submission: it can select a different build from the one inspected. A failed frozen-credential build requires an explicit owner credential-maintenance session; do not weaken the workflow to regenerate signing material silently.

After TestFlight processing, install the submitted build on a physical iPhone and verify:

- first launch and persisted onboarding;
- microphone deny, later allow, and clear permission copy;
- a real English live-voice turn and a real Hindi reply-mode turn;
- audio track disabled between turns and released on End, navigation, and background;
- no background recording or retained microphone file;
- typed chat, speech playback, reporting, and remote deletion;
- privacy/support/terms pages and production backend behavior;
- processed TestFlight size and absence of unexpected App Store Connect warnings.

Only then open **Actions → Record iOS physical signoff → Run workflow** on `main`. Enter the exact 40-character release commit, EAS build ID, TestFlight version/build number, confirm the complete checklist, and record the device/iOS details in notes. A false checklist confirmation fails instead of producing a successful skipped job; the successful run summary attributes the evidence to the dispatching GitHub actor.

TestFlight processing success and a recorded physical signoff are not App Store review submission; public App Store release remains a separate owner action.
