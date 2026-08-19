#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 path/to/app.ipa" >&2
  exit 64
fi

exec python3 - "$1" <<'PY'
from __future__ import annotations

import json
import os
import plistlib
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


def fail(message: str) -> None:
    raise SystemExit(f"IPA inspection failed: {message}")


def required_text(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        fail(f"{name} is required")
    return value


def required_positive_int(name: str) -> int:
    value = required_text(name)
    if not value.isdigit() or int(value) <= 0:
        fail(f"{name} must be a positive integer")
    return int(value)


def run_checked(command: list[str], label: str) -> subprocess.CompletedProcess[bytes]:
    try:
        result = subprocess.run(command, check=False, capture_output=True)
    except FileNotFoundError:
        fail(f"{label} tool is unavailable: {command[0]}")
    if result.returncode != 0:
        fail(f"{label} failed with exit code {result.returncode}")
    return result


def load_plist(path: Path, label: str) -> dict:
    try:
        value = plistlib.loads(path.read_bytes())
    except Exception as error:
        fail(f"{label} is not a valid plist ({error})")
    if not isinstance(value, dict):
        fail(f"{label} must contain a plist dictionary")
    return value


def plist_from_codesign(result: subprocess.CompletedProcess[bytes], label: str) -> dict:
    for stream in (result.stdout, result.stderr, result.stdout + result.stderr):
        for marker in (b"<?xml", b"bplist00"):
            start = stream.find(marker)
            if start >= 0:
                try:
                    value = plistlib.loads(stream[start:])
                except Exception:
                    continue
                if isinstance(value, dict):
                    return value
    fail(f"{label} did not expose parseable signed entitlements")


def byte_count(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def contains_bytes(root: Path, needle: bytes) -> bool:
    for item in root.rglob("*"):
        if not item.is_file():
            continue
        try:
            with item.open("rb") as handle:
                remainder = b""
                while chunk := handle.read(1024 * 1024):
                    data = remainder + chunk
                    if needle in data:
                        return True
                    remainder = data[-max(0, len(needle) - 1):]
        except OSError as error:
            fail(f"could not scan {item.relative_to(root)} ({error})")
    return False


ipa = Path(sys.argv[1]).resolve()
if not ipa.is_file() or ipa.suffix.lower() != ".ipa":
    fail("the input must be an existing .ipa file")

expected_app_id = required_text("EXPECTED_APP_IDENTIFIER")
expected_widget_id = os.environ.get("EXPECTED_WIDGET_IDENTIFIER", f"{expected_app_id}.widgets").strip()
expected_group_id = os.environ.get("EXPECTED_APP_GROUP", f"group.{expected_app_id}").strip()
expected_api_url = required_text("EXPECTED_API_URL").rstrip("/")
expected_site_url = required_text("EXPECTED_PUBLIC_SITE_URL").rstrip("/")
forbidden_urls = [value.strip().rstrip("/") for value in required_text("FORBIDDEN_RELEASE_URLS").split(",") if value.strip()]
if not forbidden_urls:
    fail("FORBIDDEN_RELEASE_URLS must contain at least one staging URL")

max_ipa_bytes = required_positive_int("MAX_IPA_BYTES")
max_app_bytes = required_positive_int("MAX_EXPANDED_APP_BYTES")
baseline_ipa_bytes = required_positive_int("BASELINE_IPA_BYTES")
growth_percent = required_positive_int("MAX_IPA_GROWTH_PERCENT")

# Bound ZIP work before extraction. The app budget covers Payload/*.app while
# a small fixed allowance accommodates normal IPA metadata and SwiftSupport.
max_archive_members = 50_000
max_archive_overhead_bytes = 64 * 1024 * 1024
max_archive_bytes = max_app_bytes + max_archive_overhead_bytes
max_compression_ratio = 500

ipa_bytes = ipa.stat().st_size
if ipa_bytes > max_ipa_bytes:
    fail(f"IPA size {ipa_bytes} exceeds MAX_IPA_BYTES {max_ipa_bytes}")
growth_limit = baseline_ipa_bytes + (baseline_ipa_bytes * growth_percent // 100)
if ipa_bytes > growth_limit:
    fail(f"IPA size {ipa_bytes} exceeds approved baseline growth limit {growth_limit}")

codesign = os.environ.get("CODESIGN_BIN", "codesign")
security = os.environ.get("SECURITY_BIN", "security")

with tempfile.TemporaryDirectory(prefix="bolo-ipa-") as temp_directory:
    root = Path(temp_directory)
    try:
        with zipfile.ZipFile(ipa) as archive:
            members = archive.infolist()
            if len(members) > max_archive_members:
                fail(f"archive contains {len(members)} members; maximum is {max_archive_members}")
            expanded_archive_bytes = 0
            for member in members:
                destination = (root / member.filename).resolve()
                if root not in destination.parents and destination != root:
                    fail(f"archive contains an unsafe path: {member.filename}")
                if member.flag_bits & 0x1:
                    fail(f"archive contains an encrypted member: {member.filename}")
                member_mode = member.external_attr >> 16
                if stat.S_ISLNK(member_mode):
                    fail(f"archive contains a symbolic link: {member.filename}")
                if member.is_dir():
                    continue
                if member.file_size > max_app_bytes:
                    fail(f"archive member {member.filename} exceeds MAX_EXPANDED_APP_BYTES")
                expanded_archive_bytes += member.file_size
                if expanded_archive_bytes > max_archive_bytes:
                    fail(f"archive expanded size exceeds safe limit {max_archive_bytes}")
                if member.file_size and (
                    member.compress_size == 0
                    or member.file_size / member.compress_size > max_compression_ratio
                ):
                    fail(f"archive member {member.filename} exceeds safe compression ratio {max_compression_ratio}:1")
            archive.extractall(root)
    except (zipfile.BadZipFile, OSError) as error:
        fail(f"IPA is not a valid ZIP archive ({error})")

    apps = sorted((root / "Payload").glob("*.app"))
    if len(apps) != 1:
        fail(f"expected exactly one Payload/*.app; found {len(apps)}")
    app = apps[0]
    app_bytes = byte_count(app)
    if app_bytes > max_app_bytes:
        fail(f"expanded app size {app_bytes} exceeds MAX_EXPANDED_APP_BYTES {max_app_bytes}")

    info = load_plist(app / "Info.plist", "main Info.plist")
    if info.get("CFBundleIdentifier") != expected_app_id:
        fail("main CFBundleIdentifier does not match EXPECTED_APP_IDENTIFIER")
    if info.get("CFBundlePackageType") != "APPL":
        fail("main CFBundlePackageType must be APPL")
    for version_key in ("CFBundleShortVersionString", "CFBundleVersion"):
        version_value = info.get(version_key)
        if not isinstance(version_value, str) or not version_value.strip():
            fail(f"{version_key} must be present and non-empty")
    executable = info.get("CFBundleExecutable")
    if not isinstance(executable, str) or not (app / executable).is_file():
        fail("main bundle executable is missing")
    microphone_copy = info.get("NSMicrophoneUsageDescription")
    if not isinstance(microphone_copy, str) or not microphone_copy.strip():
        fail("NSMicrophoneUsageDescription must be present and non-empty")
    for key, value in info.items():
        if key.startswith("NS") and key.endswith("UsageDescription"):
            if not isinstance(value, str) or not value.strip():
                fail(f"{key} must contain non-empty permission copy")
    if info.get("ITSAppUsesNonExemptEncryption") is not False:
        fail("ITSAppUsesNonExemptEncryption must be false")
    arbitrary_loads = info.get("NSAppTransportSecurity", {}).get("NSAllowsArbitraryLoads")
    if arbitrary_loads is not False:
        fail("NSAllowsArbitraryLoads must be explicitly false")
    device_family = info.get("UIDeviceFamily")
    if device_family != [1]:
        fail(f"UIDeviceFamily must be phone-only [1], received {device_family!r}")

    bundles = [app] + sorted(app.glob("PlugIns/*.appex"))
    widget_found = False
    entitlement_summaries: list[dict[str, object]] = []
    for bundle in bundles:
        run_checked([codesign, "--verify", "--deep", "--strict", "--verbose=2", str(bundle)], f"signature verification for {bundle.name}")
        entitlement_result = run_checked([codesign, "-d", "--entitlements", ":-", str(bundle)], f"entitlement extraction for {bundle.name}")
        entitlements = plist_from_codesign(entitlement_result, f"entitlements for {bundle.name}")
        bundle_info = load_plist(bundle / "Info.plist", f"Info.plist for {bundle.name}")
        bundle_id = bundle_info.get("CFBundleIdentifier")
        if not isinstance(bundle_id, str) or not (bundle_id == expected_app_id or bundle_id.startswith(f"{expected_app_id}.")):
            fail(f"unexpected nested bundle identifier {bundle_id!r}")
        application_id = entitlements.get("application-identifier")
        if not isinstance(application_id, str) or not application_id.endswith(f".{bundle_id}"):
            fail(f"signed application-identifier does not match {bundle_id}")
        if entitlements.get("get-task-allow") is True:
            fail(f"{bundle_id} is signed with get-task-allow")
        groups = entitlements.get("com.apple.security.application-groups", [])
        if expected_group_id not in groups:
            fail(f"{bundle_id} is missing app group {expected_group_id}")
        if bundle_id == expected_widget_id:
            widget_found = True
        entitlement_summaries.append({"bundle_id": bundle_id, "app_group": expected_group_id})
    if not widget_found:
        fail(f"widget extension {expected_widget_id} is missing")

    embedded_frameworks = sorted(app.rglob("*.framework"))
    for framework in embedded_frameworks:
        run_checked(
            [codesign, "--verify", "--strict", "--verbose=2", str(framework)],
            f"embedded framework signature verification for {framework.name}",
        )

    profile = app / "embedded.mobileprovision"
    if not profile.is_file():
        fail("embedded.mobileprovision is missing from the signed store build")
    profile_result = run_checked([security, "cms", "-D", "-i", str(profile)], "provisioning-profile decoding")
    try:
        profile_plist = plistlib.loads(profile_result.stdout)
    except Exception as error:
        fail(f"provisioning profile is not a valid plist ({error})")
    profile_entitlements = profile_plist.get("Entitlements", {})
    profile_app_id = profile_entitlements.get("application-identifier")
    if not isinstance(profile_app_id, str) or not profile_app_id.endswith(f".{expected_app_id}"):
        fail("provisioning profile application-identifier does not match the app")
    if profile_entitlements.get("get-task-allow") is True:
        fail("provisioning profile enables get-task-allow")
    if profile_plist.get("ProvisionedDevices") or profile_plist.get("ProvisionsAllDevices") is True:
        fail("provisioning profile is not an App Store distribution profile")

    privacy_manifests = sorted(app.rglob("PrivacyInfo.xcprivacy"))
    if not privacy_manifests:
        fail("no PrivacyInfo.xcprivacy manifest was found")
    for manifest in privacy_manifests:
        value = load_plist(manifest, str(manifest.relative_to(app)))
        if "NSPrivacyTracking" in value and not isinstance(value["NSPrivacyTracking"], bool):
            fail(f"{manifest.relative_to(app)} has an invalid NSPrivacyTracking value")
        if "NSPrivacyAccessedAPITypes" in value and not isinstance(value["NSPrivacyAccessedAPITypes"], list):
            fail(f"{manifest.relative_to(app)} has invalid NSPrivacyAccessedAPITypes")

    for expected_url in (expected_api_url, expected_site_url):
        if not contains_bytes(app, expected_url.encode("utf-8")):
            fail(f"built application does not contain expected endpoint {expected_url}")
    for forbidden_url in forbidden_urls:
        if forbidden_url in {expected_api_url, expected_site_url}:
            fail("a forbidden staging URL equals an expected production URL")
        if contains_bytes(app, forbidden_url.encode("utf-8")):
            fail("built application contains a forbidden staging endpoint")

    forbidden_names = re.compile(r"(^|/)(\.env(?:\..*)?|AuthKey_.*\.p8|google-service-account\.json|.*\.(?:pem|p12|jks))$", re.IGNORECASE)
    for item in app.rglob("*"):
        if item.is_file() and forbidden_names.search(item.relative_to(app).as_posix()):
            fail("built application contains a forbidden credential-like file")

    secret_patterns = [
        re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
        re.compile(rb"sk-(?:proj-)?[A-Za-z0-9_-]{20,}"),
        re.compile(rb"ek_[A-Za-z0-9_-]{24,}"),
        re.compile(rb"AKIA[0-9A-Z]{16}"),
        re.compile(rb"gh[pousr]_[A-Za-z0-9]{36,}"),
        re.compile(rb"xox[baprs]-[A-Za-z0-9-]{20,}"),
    ]
    for item in app.rglob("*"):
        if not item.is_file() or item.name == "embedded.mobileprovision":
            continue
        try:
            content = item.read_bytes()
        except OSError as error:
            fail(f"could not inspect {item.relative_to(app)} ({error})")
        if any(pattern.search(content) for pattern in secret_patterns):
            fail("built application contains a credential-like byte pattern")

report = {
    "ipa": ipa.name,
    "ipa_size_bytes": ipa_bytes,
    "expanded_app_size_bytes": app_bytes,
    "baseline_ipa_bytes": baseline_ipa_bytes,
    "baseline_growth_limit_bytes": growth_limit,
    "maximum_ipa_bytes": max_ipa_bytes,
    "maximum_expanded_app_bytes": max_app_bytes,
    "bundle_identifier": expected_app_id,
    "widget_bundle_identifier": expected_widget_id,
    "privacy_manifest_count": len(privacy_manifests),
    "embedded_framework_count": len(embedded_frameworks),
    "signed_bundles": entitlement_summaries,
}
report_path = Path(os.environ.get("IOS_INSPECTION_REPORT", "ios-artifact-inspection.json"))
report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
if github_output := os.environ.get("GITHUB_OUTPUT"):
    with Path(github_output).open("a", encoding="utf-8") as output:
        output.write(f"ipa_size_bytes={ipa_bytes}\n")
        output.write(f"expanded_app_size_bytes={app_bytes}\n")
print(json.dumps(report, indent=2, sort_keys=True))
PY
