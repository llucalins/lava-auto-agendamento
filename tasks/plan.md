# Implementation Plan: Car Wash Scheduling MVP

## Sprint 01 — plano corretivo MVP Lean (13–19/10/2026)

Este plano executa `SPEC-mvp-lean-sprint-01.md` e prevalece para o trabalho corrente sem apagar o plano histórico abaixo.

| Ordem | Prioridade | Slice vertical | Dependências | Aceite e verificação | Arquivos principais |
|---:|:---:|---|---|---|---|
| 1 | P0 | Segurança de dependências | — | Atualizações mínimas baseadas em advisory; audits prod/completo sem `high`/`critical` alcançável; teste, types, lint e build verdes | `package.json`, `package-lock.json`, `docs/dependency-review.md` |
| 2 | P0 | Playwright e CI browser | 1 | 23+ cenários concluem e o processo encerra com código 0; `/admin/calendar` funciona pré-hidratação; workflow preserva isolamento | `playwright.config.ts`, `.github/workflows/ci.yml`, testes E2E |
| 3 | P0 | Revisão pública autoritativa | 1 | API reconcilia pacote/preço/duração/revisões/horário; confirmação rejeita snapshot obsoleto; integração PostgreSQL e browser verdes | booking UI/API/capabilities/tests |
| 4 | P0 | Idempotência de ponta a ponta | 3 | dupla submissão, concorrência e resposta perdida produzem uma reserva e uma alocação | booking API/capabilities/tests E2E e integração |
| 5 | P0 | Admin operacional | 2 | login → lista → detalhe → status/cancelamento no navegador; autorização, CSRF, revisão e auditoria validados | páginas/admin APIs/capabilities/tests |
| 6 | P1 | Configuração essencial navegável | 5 | pacotes e calendário podem ser operados sem API manual; conflitos não sobrescrevem dados | páginas/admin APIs/tests E2E |
| 7 | P0 | Gate seguro de produção | 1 | configuração obrigatória validada, health/readiness mínimo e gate de PII real fail-closed | config, health, testes, `.env.example` |
| 8 | P1 | Logs e abuso de instância única | 7 | eventos allowlisted sem PII e limites locais aplicados/documentados | observability, abuse, rotas, testes |
| 9 | P0 | Deploy/backup/privacidade | 7 | runbooks de HTTPS/PostgreSQL/migração/rollback; restore sintético executado quando ambiente permitir; aviso visível; gates humanos explícitos | `docs`, UI pública, scripts/testes |
| 10 | P0 | Verificação/revisão final | 1–9 | suítes completas, audits, revisão de segurança e diff; CI remoto somente se já disponível sem mutação externa | docs de readiness e relatório |

### Sequência dos seis dias restantes

- Dia 2 (14/10): slices 1–2 e reavaliação obrigatória do advisory extraordinário anunciado pelo Next.js.
- Dia 3 (15/10): slices 3–4.
- Dia 4 (16/10): slice 5.
- Dia 5 (17/10): slices 6–8.
- Dia 6 (18/10): slice 9, restore sintético e ensaio de demonstração.
- Dia 7 (19/10): slice 10, correções estritamente bloqueadoras e pacote de homologação.

### Gates humanos que não serão autoaprovados

Base legal/necessidade/transparência de CPF; retenção e descarte; controlador/operador e canal do titular; provedor de hosting/PostgreSQL/OIDC-MFA; domínio/TLS; DPA/localização; bootstrap e recuperação do OWNER; destino, retenção e monitoramento de backups; orçamento e janela de publicação.

### Pós-MVP (P2)

Multi-tenancy/SaaS, assinatura, cobrança online, WhatsApp automático, relatórios avançados, equipes/permissões sofisticadas, rate limit distribuído, infraestrutura multi-instância e tracking público ampliado.

## Objective

Deliver the approved secure MVP: package-first public booking, interval availability and atomic confirmation, status-only public tracking, and protected staff operations. Correctness, privacy, and multi-instance safety are first-class acceptance conditions.

## Sources of Truth

`docs/intent/car-wash-scheduling.md`, `CAPABILITY_MAP.md`, `docs/security/threat-model.md`, every `SPEC-*.md`, `docs/architecture/detailed-architecture.md`, and ADRs `0001`–`0005`. The current architecture resolves package price as non-negative: `price_centavos >= 0`; duration remains positive and bounded.

## Approved Architecture Summary

- TypeScript, Next.js App Router, supported Node LTS, and a modular monolith.
- PostgreSQL is the sole authoritative database; `pg` provides a thin SQL/transaction boundary and `node-pg-migrate` owns forward migrations.
- Zod validates untrusted boundaries; Vitest and Playwright test domain/integration and browser flows.
- PostgreSQL persists/coordinates sessions, authorization versions, idempotency, booking allocations, tracking, and durable audit.
- Managed OIDC/MFA authenticates identity; PostgreSQL local sessions and application-owned authorization remain authoritative.
- Tracking uses an opaque verifier-only credential, body proof, a PostgreSQL tracking session, and a status-only projection.

## Implementation Strategy

Establish minimal supply-chain/config/transaction foundations, then build catalogue and calendar read slices. Prove booking allocation, idempotency, and PostgreSQL concurrency before the public confirmation UI. Establish durable audit before high-impact admin operations. Build OIDC/session/authorization before protected admin slices and the dedicated sensitive disclosure gate. Add tracking independently of booking confirmation, then hardening, retention, observability, and CI incrementally rather than as a final integration phase.

## Dependency Graph

```text
dependency/config + pg/migrations
 ├─ catalogue + calendar ──> booking/capacity/idempotency ──> public booking
 ├─ durable audit ──> auth/session ──> authorization ──> admin operations/disclosure
 └─ booking lifecycle ──> tracking credential/proof/session/status
shared security, observability, retention, and CI attach progressively
```

## Phases

1. Dependency, toolchain, config, PostgreSQL, and audit foundations.
2. Catalogue, calendar, booking integrity, capacity, and idempotency.
3. Public booking vertical flow.
4. OIDC/session/authorization and protected operations.
5. Sensitive disclosure and public tracking.
6. Hardening, resource controls, observability, retention, and CI/review.

## Checkpoints

`tasks/todo.md` includes 15 checkpoints, each after two or three tasks. Evidence evolves from focused tests to PostgreSQL integration/concurrency, browser validation, lint/typecheck/build, security review, and human review.

## Production Gates

CPF purpose, lawful basis, necessity/proportionality, and transparency notice; fiscal requirements; hosting/PostgreSQL/OIDC-MFA providers; DPA/data-location review; first OWNER bootstrap; MFA factor/enrollment/recovery; backup retention; tracking replacement assurance; abuse/security-signal retention; and shared/edge rate-limit provider remain unresolved. They block production configuration or enabling associated jobs—not local core implementation.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Double booking/release error | Native range/exclusion constraints, guarded transaction paths, real concurrent PostgreSQL tests. |
| Confirmation lost response | Idempotency outcome is recovered before newer catalogue/calendar validation. |
| PII disclosure race | Audit-first, final primary-DB current authorization predicate, minimal projection, privilege-reduction race test. |
| Tracking secret leak | Verifier-only storage, neutral URL/body proof, generic responses, no-store and browser checks. |
| PII/secret observability leak | Allowlisted fields, no bodies/headers, synthetic test data, redaction tests. |
| Supply-chain risk | Version/provenance review, one lockfile, fail-closed script policy, frozen CI install/audit. |

## Open Questions

- Confirm only permission granularity for EMPLOYEE assignments (for example cancellation, catalogue/calendar configuration, and sensitive-field grants); OWNER/EMPLOYEE, application-owned permission authorization, default deny, and actor/action/resource/field checks are approved.
- Approve OIDC/MFA, hosting, PostgreSQL, DPA/data location, bootstrap, recovery, and rate-limit enforcement.
- Approve backup, tracking verifier/session, idempotency, and security-signal retention values.
- Complete CPF and fiscal legal/business documentation for production.

## Definition of Done

Each task is independently verified using synthetic data, preserves module/PII boundaries, adds no prohibited browser storage/logging, stays reviewable and atomic, and meets its stated acceptance criteria. The MVP is production-ready only after all checkpoints and all production gates have human approval.
