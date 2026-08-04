#!/usr/bin/env bash
set -euo pipefail

install_directory="${1:?usage: install-actionlint.sh INSTALL_DIRECTORY}"
version="1.7.7"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)
    platform="darwin_arm64"
    checksum="2693315b9093aeacb4ebd91a993fea54fc215057bf0da2659056b4bc033873db"
    ;;
  Darwin-x86_64)
    platform="darwin_amd64"
    checksum="28e5de5a05fc558474f638323d736d822fff183d2d492f0aecb2b73cc44584f5"
    ;;
  Linux-x86_64)
    platform="linux_amd64"
    checksum="023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757"
    ;;
  *)
    printf 'Unsupported platform: %s-%s\n' "$(uname -s)" "$(uname -m)" >&2
    exit 1
    ;;
esac

archive="actionlint_${version}_${platform}.tar.gz"
download_url="https://github.com/rhysd/actionlint/releases/download/v${version}/${archive}"
temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT

curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \
  "$download_url" \
  --output "$temporary_directory/$archive"

printf '%s  %s\n' "$checksum" "$temporary_directory/$archive" |
  shasum -a 256 --check -

tar -xzf "$temporary_directory/$archive" -C "$temporary_directory" actionlint
install -d "$install_directory"
install -m 0755 "$temporary_directory/actionlint" "$install_directory/actionlint"
"$install_directory/actionlint" -version
