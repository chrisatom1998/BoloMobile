# Dependency security exceptions

No temporary high-severity exceptions are active.

## Historical remediation

On 2026-09-03, the Expo SDK 57 patch update replaced the dependency versions that had reported two high-severity `image-size` advisories. Because `npm audit` no longer reports those advisories, their temporary records were removed from this document, the runtime audit baseline, and the release gate.

On 2026-10-29, the lockfile was bumped so the remaining high-severity findings cleared without a new exception:

- `zod` is pinned to 4.6.7, which includes the fix for [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) (memory use while checking very large lists).
- `node-forge` is pinned to 1.4.2, which is past [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv).
- [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) (`braces`) is no longer reported, so its exception was removed.

If either old advisory appears again, the audit gate will treat it as an unapproved high-severity finding and block release. Any future exception requires a new, explicit security review and a matching code change.

<!-- acceptance-record:begin -->
```json
{
  "version": 1,
  "exceptions": []
}
```
<!-- acceptance-record:end -->
