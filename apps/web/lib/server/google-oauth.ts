import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Environment = Record<string, string | undefined>;

type GoogleOAuthClientFile = {
  installed?: {
    client_id?: string;
    client_secret?: string;
  };
  web?: {
    client_id?: string;
    client_secret?: string;
  };
};

export type GoogleOAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

export function getGoogleOAuthCredentials(
  environment: Environment = process.env,
): GoogleOAuthCredentials | null {
  const clientId = environment.AUTH_GOOGLE_ID?.trim();
  const clientSecret = environment.AUTH_GOOGLE_SECRET?.trim();

  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }

  const credentialsFile =
    environment.AUTH_GOOGLE_CREDENTIALS_FILE?.trim();
  if (!credentialsFile) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      readFileSync(resolve(credentialsFile), "utf8"),
    ) as GoogleOAuthClientFile;
    const credentials = parsed.web ?? parsed.installed;
    const fileClientId = credentials?.client_id?.trim();
    const fileClientSecret = credentials?.client_secret?.trim();

    if (!fileClientId || !fileClientSecret) {
      return null;
    }

    return {
      clientId: fileClientId,
      clientSecret: fileClientSecret,
    };
  } catch {
    return null;
  }
}
