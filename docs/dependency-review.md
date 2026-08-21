# Dependency and Installation-Policy Review

## Scope

This is the Task 1 pre-install gate. It selects no packages, creates no
application/tooling bootstrap, and does not authorize installation. Task 2
will choose the project manifest and lockfile after this record is reviewed.

## Verified facts

| Area | Verified fact | Authoritative source |
|---|---|---|
| Node.js | Production applications should use an Active or Maintenance LTS line; Node 24 is currently LTS. | [Node release schedule](https://nodejs.org/en/about/previous-releases) |
| Next.js | The App Router is the approved router and its official docs describe TypeScript setup through `create-next-app`. | [Next.js App Router docs](https://nextjs.org/docs/app) |
| PostgreSQL migrations | `node-pg-migrate` 9.0.0 is the stable `latest` release; the newer 10.0.0 releases are alpha prereleases at this checkpoint (for example 10.0.0-alpha.2). Its published prerequisites are Node >=20.11 and PostgreSQL >=13. | [node-pg-migrate package](https://www.npmjs.com/package/node-pg-migrate?activeTab=versions); [official releases](https://github.com/salsita/node-pg-migrate/releases) |
| npm lifecycle scripts | npm documents `ignore-scripts`; when true, lifecycle scripts are not run during install. | [npm configuration](https://docs.npmjs.com/cli/using-npm/config/) |

## Decision for this project

- Use npm and commit `package-lock.json` as the single project lockfile when
  Task 2 creates the project. This is an implementation inference from the
  explicit `.npmrc` policy and selected toolchain, not an installation here.
- Pin a supported Node 24 LTS release in the later project metadata/CI rather
  than relying on a developer's global runtime.
- Install `node-pg-migrate` only from its stable 9.x line, subject to the
  final manifest/provenance review; do not use a prerelease version.
- Before the first install, inspect every pending dependency lifecycle script,
  approve only the minimum necessary packages through a reviewed policy, and
  retain the authoritative lockfile. Do not use blanket script approval.

## Required later verification before installation

1. Review current official release notes and compatibility for Next.js,
   TypeScript, `pg`, Zod, Vitest, Playwright, and `openid-client`.
2. Review direct dependencies, ownership, provenance, license, release age,
   and transitive lockfile changes together.
3. Perform the first install with lifecycle scripts blocked by `.npmrc`; only
   approve specific necessary scripts after inspection.
4. Run the package-manager audit and applicable provenance/signature checks
   against the resulting lockfile; triage findings by reachability and fix
   risk rather than applying forced remediation.

## Temporary ESLint tooling compatibility exception

- ESLint 9.39.5 is EOL upstream: ESLint 10.x is Current, and the ESLint
  project states that 9.x reached EOL on 2026-08-06 and receives no further
  updates. [ESLint version support](https://eslint.org/version-support/)
- It is retained temporarily as a development-tooling compatibility exception,
  not an application runtime dependency exception. The current stable
  `next@16.3.2` / `eslint-config-next@16.3.2` lint stack does not resolve
  cleanly with ESLint 10 under normal npm peer resolution: its bundled
  `eslint-plugin-react`, `eslint-plugin-import`, and `eslint-plugin-jsx-a11y`
  peer ranges stop at ESLint 9. The version-matched Next.js configuration uses
  `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.
  [Next.js ESLint configuration](https://nextjs.org/docs/app/api-reference/config/eslint)
- No `--force`, `--legacy-peer-deps`, or peer-dependency override is used.
  The project keeps `.npmrc` `ignore-scripts=true` active, and the current npm
  production and full audits report zero known vulnerabilities.
- Re-evaluate and migrate to a supported ESLint release as soon as the stable
  Next.js lint stack permits normal peer resolution without forced overrides.

## Non-goals

- No dependency versions are frozen here except the migration-tool release
  line constraint stated above.
- No provider, database service, package, application file, or lockfile is
  selected or installed by this task.
