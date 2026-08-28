export interface BackendConfig {
  allowedOrigins: string[];
  appleSignInAudiences: string[];
  appleSignInEnabled: boolean;
  databaseUrl: string;
  host: string;
  passwordAuthEnabled: boolean;
  passwordRegistrationEnabled: boolean;
  port: number;
  retentionSweepIntervalMs: number;
  sessionTtlSeconds: number;
  simulatedAuthEnabled: boolean;
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

export function loadConfig(): BackendConfig {
  const nodeEnvironment = process.env.NODE_ENV ?? "development";
  const simulatedAuthEnabled = parseBoolean(
    process.env.SIMULATED_AUTH_ENABLED,
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
    databaseUrl: requireValue("DATABASE_URL"),
    host: process.env.HOST ?? "0.0.0.0",
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
    chatMediaStorage,
  };
}
