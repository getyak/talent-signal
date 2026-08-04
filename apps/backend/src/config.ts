export interface BackendConfig {
  allowedOrigins: string[];
  databaseUrl: string;
  host: string;
  port: number;
  sessionTtlSeconds: number;
  simulatedAuthEnabled: boolean;
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

  return {
    allowedOrigins: (
      process.env.ALLOWED_ORIGINS ??
      "http://localhost:3000,http://127.0.0.1:3000"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    databaseUrl: requireValue("DATABASE_URL"),
    host: process.env.HOST ?? "0.0.0.0",
    port: Number.parseInt(process.env.PORT ?? "4317", 10),
    sessionTtlSeconds: Number.parseInt(
      process.env.SESSION_TTL_SECONDS ?? "28800",
      10,
    ),
    simulatedAuthEnabled,
  };
}
