#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: $0 ABSOLUTE_OUTPUT_DIRECTORY [PORT]" >&2
  exit 64
fi

output_directory="$1"
port="${2:-4443}"
if [[ "$output_directory" != /* ]]; then
  echo "output directory must be absolute" >&2
  exit 64
fi
if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1024 || port > 65535 )); then
  echo "port must be an unprivileged TCP port" >&2
  exit 64
fi

umask 077
mkdir -p "$output_directory"
chmod 700 "$output_directory"
certificate="$output_directory/server-certificate.pem"
private_key="$output_directory/server-private-key.pem"
openssl_config="$output_directory/.openssl-${port}.cnf"

if [[ -e "$certificate" || -e "$private_key" ]]; then
  if [[ ! -f "$certificate" || ! -f "$private_key" ]]; then
    echo "refusing a partial TLS identity; move it aside and retry" >&2
    exit 1
  fi
else
  trap 'rm -f "$openssl_config"' EXIT
  printf '%s\n' \
    '[req]' \
    'distinguished_name = dn' \
    'x509_extensions = extensions' \
    'prompt = no' \
    '[dn]' \
    'CN = Talent Signal Hybrid Loopback' \
    '[extensions]' \
    'basicConstraints = critical,CA:FALSE' \
    'keyUsage = critical,digitalSignature,keyEncipherment' \
    'extendedKeyUsage = serverAuth' \
    'subjectAltName = @alt_names' \
    '[alt_names]' \
    'IP.1 = 127.0.0.1' \
    'IP.2 = ::1' \
    'DNS.1 = localhost' > "$openssl_config"
  openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 30 \
    -config "$openssl_config" \
    -keyout "$private_key" \
    -out "$certificate" >/dev/null 2>&1
fi

chmod 600 "$private_key"
chmod 644 "$certificate"
fingerprint="$(openssl x509 -in "$certificate" -noout -fingerprint -sha256 | cut -d= -f2)"

printf 'TALENT_SIGNAL_TLS_CERTIFICATE_PATH=%s\n' "$certificate"
printf 'TALENT_SIGNAL_TLS_PRIVATE_KEY_PATH=%s\n' "$private_key"
printf 'HOST=127.0.0.1\n'
printf 'PORT=%s\n' "$port"
printf 'Hybrid base URL: https://127.0.0.1:%s\n' "$port"
printf 'Certificate SHA-256: %s\n' "$fingerprint"
printf 'Paste only server-certificate.pem into the Hybrid App; never paste or share server-private-key.pem.\n'
