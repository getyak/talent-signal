const requestedNames = process.argv.slice(2);

export function secretPresence(environment, names) {
  return names.map((name) => ({
    name,
    present:
      Object.prototype.hasOwnProperty.call(environment, name) &&
      typeof environment[name] === "string" &&
      environment[name].trim().length > 0,
  }));
}

export function verifySecretEnvironment(environment, names) {
  if (names.length === 0) {
    return {
      ok: false,
      message: "Pass one or more environment variable names to verify.",
      results: [],
    };
  }

  const results = secretPresence(environment, names);
  const missing = results.filter(({ present }) => !present);
  return {
    ok: missing.length === 0,
    message:
      missing.length === 0
        ? `Verified ${results.length} injected secret names.`
        : `Missing ${missing.length} injected secret names.`,
    results,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const verification = verifySecretEnvironment(process.env, requestedNames);
  for (const result of verification.results) {
    console.log(`${result.name}: ${result.present ? "present" : "missing"}`);
  }
  console.log(verification.message);
  if (!verification.ok) process.exitCode = 1;
}
