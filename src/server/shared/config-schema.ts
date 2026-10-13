import { z } from "zod";

const serverConfigSchema = z.object({
  DATABASE_URL: z
    .url()
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      { message: "Expected a PostgreSQL URL" },
    ),
});

export type ServerConfig = Readonly<{
  databaseUrl: string;
}>;

export function loadServerConfig(
  environment: Readonly<Record<string, string | undefined>>,
  production = false,
): ServerConfig {
  const schema = production
    ? serverConfigSchema.extend({
        APP_ORIGIN: z.url().refine((value) => new URL(value).protocol === "https:"),
        CONFIRMATION_FINGERPRINT_KEY: z.string().min(32),
        TRACKING_VERIFIER_KEY_VERSION: z.coerce.number().int().positive(),
        TRACKING_VERIFIER_KEY: z.string().min(32),
        OIDC_ISSUER: z.url(),
        OIDC_AUTHORIZATION_ENDPOINT: z.url(),
        OIDC_TOKEN_ENDPOINT: z.url(),
        OIDC_JWKS_URI: z.url(),
        OIDC_CLIENT_ID: z.string().min(1),
        OIDC_REDIRECT_URI: z.url().refine((value) => new URL(value).protocol === "https:"),
      })
    : serverConfigSchema;
  const result = schema.safeParse(environment);

  if (!result.success) {
    throw new Error("Server configuration is invalid.");
  }

  return Object.freeze({ databaseUrl: result.data.DATABASE_URL });
}
