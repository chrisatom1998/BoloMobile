# Dependency security exceptions

No temporary high- or critical-severity dependency exceptions are active.

## Historical remediation

On 2026-09-03, the Expo SDK 57 patch update replaced the dependency versions that had reported two high-severity `image-size` advisories. Because `npm audit` no longer reports those advisories, their temporary records were removed from this document, the runtime audit baseline, and the release gate.

If either old advisory appears again, the audit gate will treat it as an unapproved high-severity finding and block release. Any future exception requires a new, explicit security review and a matching code change.

<!-- acceptance-record:begin -->
```json
{
  "version": 1,
  "exceptions": []
}
```
<!-- acceptance-record:end -->
