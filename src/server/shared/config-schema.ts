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
): ServerConfig {
  const result = serverConfigSchema.safeParse({
    DATABASE_URL: environment.DATABASE_URL,
  });

  if (!result.success) {
    throw new Error("Server configuration is invalid.");
  }

  return Object.freeze({ databaseUrl: result.data.DATABASE_URL });
}
