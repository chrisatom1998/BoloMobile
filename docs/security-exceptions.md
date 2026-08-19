# Temporary dependency security exceptions

This file records narrowly scoped security-owner decisions for dependencies that cannot yet be upgraded to a patched upstream release. It does not make `npm audit` clean, and it must never be used to suppress an unrelated advisory.

## Metro build-time image parser

Audited on 2026-08-08. The GitHub Advisory Database reports two high-severity denial-of-service advisories for every published `image-size` release through 2.0.2, with no patched version available:

- [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr): malformed ICNS input can keep the parser loop from advancing.
- [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq): malformed JXL or HEIF boxes can keep a parser loop from advancing.

Bolo receives `image-size@1.2.1` only through `metro@0.84.4`. Metro is Node.js build tooling and is not included in the shipped iOS application. The vulnerable parser is reachable by content magic bytes even when a crafted file uses a normal image extension. Triggering it therefore requires an attacker-controlled bundled asset in Bolo's source or a dependency; an asset-only contribution does not itself imply code execution. Bolo reduces that likelihood by requiring reviewed, clean, upstream-synced source and a lockfile with integrity-pinned packages before production builds. If triggered, the added impact is a hung Node.js build: CI or EAS times out and produces no release artifact.

There is currently no honest version-only remediation: the advisory records no first patched version, current Metro still depends on `image-size`, and `npm audit fix --force` proposes an unrelated breaking React Native Reanimated change. Do not spoof a package version, vendor an unmaintained fork, apply a blanket audit suppression, or claim that the audit is clean.

The exception expires on 2026-11-06. A new high or critical advisory, evidence that this parser ships in the iOS runtime, expiry without renewed review, or an upstream fix adopted by Expo/Metro invalidates this record. When an upstream fix becomes available, remove these acceptance-record entries and the matching `approvedExceptions` entries in `scripts/assert-audit-exceptions.mjs` instead of extending them.

Release and the dependency-audit CI job remain intentionally blocked while either owner or acceptedOn is `PENDING`. `/.github/CODEOWNERS` assigns this record and its enforcement files to `@chrisatom1998`; repository branch protection must separately require Code Owner approval for that review rule to be enforced. Only the named security owner may replace the pending fields after reviewing and accepting this temporary build-time risk.

<!-- acceptance-record:begin -->
```json
{
  "version": 1,
  "exceptions": [
    {
      "ghsa": "GHSA-w3rx-r6r6-pgpr",
      "module": "image-size",
      "expires": "2026-11-06",
      "owner": "PENDING",
      "acceptedOn": "PENDING"
    },
    {
      "ghsa": "GHSA-5p2g-fcmc-qvqq",
      "module": "image-size",
      "expires": "2026-11-06",
      "owner": "PENDING",
      "acceptedOn": "PENDING"
    }
  ]
}
```
<!-- acceptance-record:end -->
