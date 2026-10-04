# Dependency security exceptions

Two temporary high-severity exceptions are active. Both packages are build-time tooling only and are not bundled into the app. No patched release of either package existed when they were accepted.

| Advisory | Package | Reached through | Owner | Accepted | Expires |
| --- | --- | --- | --- | --- | --- |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `braces` ≤3.0.3 | Jest → micromatch (tests) | chris johnson | 2026-10-04 | 2027-01-01 |
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | `node-forge` ≤1.4.0 | @expo/cli code signing (developer tooling) | chris johnson | 2026-10-04 | 2027-01-01 |

Remove each entry, here and in the audit gate and runtime baseline, once a patched release is available.

## Historical remediation

On 2026-09-03, the Expo SDK 57 patch update replaced the dependency versions that had reported two high-severity `image-size` advisories. Because `npm audit` no longer reports those advisories, their temporary records were removed from this document, the runtime audit baseline, and the release gate.

If either old advisory appears again, the audit gate will treat it as an unapproved high-severity finding and block release. Any future exception requires a new, explicit security review and a matching code change.

<!-- acceptance-record:begin -->
```json
{
  "version": 1,
  "exceptions": [
    { "ghsa": "GHSA-vfj7-8cjw-p6xm", "module": "braces", "owner": "chris johnson", "acceptedOn": "2026-10-04", "expires": "2027-01-01" },
    { "ghsa": "GHSA-86w9-cpqp-85rv", "module": "node-forge", "owner": "chris johnson", "acceptedOn": "2026-10-04", "expires": "2027-01-01" }
  ]
}
```
<!-- acceptance-record:end -->
