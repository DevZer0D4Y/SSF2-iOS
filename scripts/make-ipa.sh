#!/usr/bin/env bash
# Build and package an unsigned IPA. Signing credentials are supplied separately.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DERIVED="${DERIVED:-$ROOT/build/DerivedData}"
OUT="${OUT:-$ROOT/build/SuperSmashFlash2-unsigned.ipa}"
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
python3 "$ROOT/scripts/fetch-assets.py"
xcodebuild -project "$ROOT/SSF2-iOS.xcodeproj" -scheme SSF2-iOS -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath "$DERIVED" -jobs 2 \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= build -quiet
APP="$DERIVED/Build/Products/Release-iphoneos/SSF2-iOS.app"
test -d "$APP"
mkdir -p "$ROOT/build"
STAGE="$(mktemp -d "$ROOT/build/package.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
mkdir "$STAGE/Payload"
# Clone resources on APFS to avoid duplicating the large game during packaging.
if ! cp -cR "$APP" "$STAGE/Payload/SSF2-iOS.app" 2>/dev/null; then
  rm -rf "$STAGE/Payload/SSF2-iOS.app"
  ditto "$APP" "$STAGE/Payload/SSF2-iOS.app"
fi
# Remove debug symbols and their embedded local object/module paths.
xcrun strip -S "$STAGE/Payload/SSF2-iOS.app/SSF2-iOS"
# Asset downloads and Xcode can contain local metadata. Never ship it.
find "$STAGE" -name '.DS_Store' -delete
find "$STAGE" -name '*.map' -delete
rm -rf "$STAGE/Payload/SSF2-iOS.app/_CodeSignature"
rm -f "$STAGE/Payload/SSF2-iOS.app/embedded.mobileprovision"
mkdir -p "$(dirname "$OUT")"
(cd "$STAGE" && zip -qry "$STAGE/release.ipa" Payload)
mv "$STAGE/release.ipa" "$OUT"
python3 "$ROOT/scripts/audit-ipa.py" "$OUT"
echo "IPA: $OUT"
