export function isPiiProcessingAllowed(environment: Readonly<Record<string, string | undefined>>): boolean {
  return environment.NODE_ENV !== "production" || environment.PII_PROCESSING_APPROVED === "true";
}
