import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";

export interface BackendConfig {
  allowedOrigins: string[];
  appleSignInAudiences: string[];
  appleSignInEnabled: boolean;
  googleSignInAudiences?: string[];
  databaseUrl: string;
  host: string;
  passwordAuthEnabled: boolean;
  passwordRegistrationEnabled: boolean;
  port: number;
  retentionSweepIntervalMs: number;
  sessionTtlSeconds: number;
  simulatedAuthEnabled: boolean;
  internalLabEnabled?: boolean;
  tls?: { certificatePem: string; privateKeyPem: string };
  chatMediaStorage?:
    | { provider: "local"; directory: string }
    | {
        provider: "s3";
        bucket: string;
        endpoint?: string;
        forcePathStyle: boolean;
        region: string;
      };
}

function requireValue(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  return value === "true";
}

function pkcs8PrivateKeyBoundary(kind: "BEGIN" | "END"): string {
  return `-----${kind} ${["PRIVATE", "KEY"].join(" ")}-----`;
}

function readTlsFile(path: string, label: string, isPrivate: boolean): string {
  if (!isAbsolute(path)) throw new Error(`${label} path must be absolute.`);
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`${label} must be a regular file, not a symlink.`);
  }
  if (metadata.size < 1 || metadata.size > 64 * 1024) {
    throw new Error(`${label} must be between 1 byte and 64 KiB.`);
  }
  if (typeof process.geteuid === "function" && metadata.uid !== process.geteuid()) {
    throw new Error(`${label} must be owned by the backend user.`);
  }
  if (isPrivate && (metadata.mode & 0o077) !== 0) {
    throw new Error(`${label} must not be group- or world-readable.`);
  }
  return readFileSync(path, "utf8");
}

export function loadTlsIdentity(
  certificatePath: string,
  privateKeyPath: string,
): NonNullable<BackendConfig["tls"]> {
  const certificatePem = readTlsFile(certificatePath, "TLS certificate", false);
  const privateKeyPem = readTlsFile(privateKeyPath, "TLS private key", true);
  if (!certificatePem.includes("-----BEGIN CERTIFICATE-----")) {
    throw new Error("TLS certificate is not PEM encoded.");
  }
  if (!privateKeyPem.includes(pkcs8PrivateKeyBoundary("BEGIN"))) {
    throw new Error("TLS private key is not PEM encoded.");
  }
  return { certificatePem, privateKeyPem };
}

export function loadConfig(): BackendConfig {
  const nodeEnvironment = process.env.NODE_ENV ?? "development";
  const simulatedAuthEnabled = parseBoolean(
    process.env.SIMULATED_AUTH_ENABLED,
    nodeEnvironment !== "production",
  );
  const internalLabEnabled = parseBoolean(
    process.env.TALENT_SIGNAL_INTERNAL_LAB_ENABLED,
    nodeEnvironment !== "production",
  );

  if (nodeEnvironment === "production" && simulatedAuthEnabled) {
    throw new Error("Simulated authentication cannot run in production.");
  }
  const passwordAuthEnabled = parseBoolean(
    process.env.PASSWORD_AUTH_ENABLED,
    nodeEnvironment !== "production",
  );
  const passwordRegistrationEnabled = parseBoolean(
    process.env.PASSWORD_REGISTRATION_ENABLED,
    nodeEnvironment !== "production",
  );
  if (passwordRegistrationEnabled && !passwordAuthEnabled) {
    throw new Error(
      "PASSWORD_AUTH_ENABLED is required when password registration is enabled.",
    );
  }
  const appleSignInAudiences = (process.env.APPLE_SIGN_IN_AUDIENCES ?? "")
    .split(",")
    .map((audience) => audience.trim())
    .filter(Boolean);
  const appleSignInEnabled = parseBoolean(
    process.env.APPLE_SIGN_IN_ENABLED,
    appleSignInAudiences.length > 0,
  );
  if (appleSignInEnabled && appleSignInAudiences.length === 0) {
    throw new Error(
      "APPLE_SIGN_IN_AUDIENCES is required when Apple sign-in is enabled.",
    );
  }
  const chatMediaProvider = process.env.CHAT_MEDIA_STORAGE_PROVIDER ?? "local";
  if (chatMediaProvider !== "local" && chatMediaProvider !== "s3") {
    throw new Error("CHAT_MEDIA_STORAGE_PROVIDER must be local or s3.");
  }
  const chatMediaStorage: NonNullable<BackendConfig["chatMediaStorage"]> =
    chatMediaProvider === "s3"
      ? {
          provider: "s3",
          bucket: requireValue("CHAT_MEDIA_S3_BUCKET"),
          region: requireValue("CHAT_MEDIA_S3_REGION"),
          forcePathStyle: parseBoolean(
            process.env.CHAT_MEDIA_S3_FORCE_PATH_STYLE,
            false,
          ),
          ...(process.env.CHAT_MEDIA_S3_ENDPOINT?.trim()
            ? { endpoint: process.env.CHAT_MEDIA_S3_ENDPOINT.trim() }
            : {}),
        }
      : {
          provider: "local",
          directory:
            process.env.CHAT_MEDIA_LOCAL_DIRECTORY?.trim() ||
            `${process.cwd()}/.data/chat-media`,
        };
  const tlsCertificatePath = process.env.TALENT_SIGNAL_TLS_CERTIFICATE_PATH?.trim();
  const tlsPrivateKeyPath = process.env.TALENT_SIGNAL_TLS_PRIVATE_KEY_PATH?.trim();
  if (Boolean(tlsCertificatePath) !== Boolean(tlsPrivateKeyPath)) {
    throw new Error(
      "TALENT_SIGNAL_TLS_CERTIFICATE_PATH and TALENT_SIGNAL_TLS_PRIVATE_KEY_PATH must be configured together.",
    );
  }
  const tls = tlsCertificatePath && tlsPrivateKeyPath
    ? loadTlsIdentity(tlsCertificatePath, tlsPrivateKeyPath)
    : undefined;
  const host = process.env.HOST ?? "0.0.0.0";
  if (tls && !["127.0.0.1", "::1"].includes(host)) {
    throw new Error("TLS mode for the macOS Hybrid adapter requires HOST=127.0.0.1 or HOST=::1.");
  }

  return {
    allowedOrigins: (
      process.env.ALLOWED_ORIGINS ??
      "http://localhost:3000,http://127.0.0.1:3000"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    appleSignInAudiences,
    appleSignInEnabled,
    googleSignInAudiences: (process.env.GOOGLE_SIGN_IN_AUDIENCES ?? "").split(",").map(value => value.trim()).filter(Boolean),
    databaseUrl: requireValue("DATABASE_URL"),
    host,
    passwordAuthEnabled,
    passwordRegistrationEnabled,
    port: Number.parseInt(process.env.PORT ?? "4317", 10),
    retentionSweepIntervalMs: Math.max(
      1_000,
      Number.parseInt(
        process.env.RETENTION_SWEEP_INTERVAL_MS ?? "60000",
        10,
      ),
    ),
    sessionTtlSeconds: Number.parseInt(
      process.env.SESSION_TTL_SECONDS ?? "28800",
      10,
    ),
    simulatedAuthEnabled,
    internalLabEnabled,
    chatMediaStorage,
    ...(tls ? { tls } : {}),
  };
}
