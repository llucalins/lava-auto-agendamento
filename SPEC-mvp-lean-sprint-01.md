# Spec: MVP Lean — Sprint 01

## Status e contexto

- Janela: 13/10/2026 a 19/10/2026.
- Destino: uma instalação de produção para um único lava-rápido piloto.
- Estado inicial reproduzido em 13/10/2026: 29 tarefas verificadas, 15 parcialmente comprovadas e 3 contraditas; 117 testes Vitest verdes; typecheck, lint e build verdes; 3 vulnerabilidades `high` no grafo de produção; Playwright conclui cenários mas não encerra; o browser job hospedado falha em `/admin/calendar`.
- A missão de Sprint 01 é a aprovação explícita deste escopo e autoriza avançar por todos os checkpoints sem uma pausa adicional entre spec e plano.

## Objetivo

Entregar um MVP mínimo, seguro e demonstrável que permita ao cliente escolher pacote e horário, informar somente os dados necessários, revisar termos autoritativos e confirmar uma única reserva; e ao proprietário autenticado listar, inspecionar e operar reservas, pacotes e calendário pelo navegador. PostgreSQL permanece a autoridade transacional e cada implantação permanece isolada.

## Escopo essencial

1. `public-booking-flow`: seleção, reconciliação autoritativa antes da revisão, confirmação idempotente, recuperação de resposta perdida e proteção de PII.
2. `booking-lifecycle`: uma confirmação por intenção e nenhuma sobreposição de alocação sob concorrência.
3. `admin-access` e `admin-operations`: login, lista, detalhe, transição de status, cancelamento e configuração essencial navegáveis, com autorização, CSRF e auditoria no servidor.
4. `service-catalog` e `operating-calendar`: pacotes/preços e horários/fechamentos essenciais para a operação piloto.
5. `privacy-governance`, `audit-trail` e operação: configuração segura, health/readiness, logs permitidos, controle de abuso proporcional a uma instância, deploy HTTPS, backup/restore/rollback e aviso de privacidade.

## Fora do escopo

- Multi-tenancy, assinaturas, cobrança online, WhatsApp automático, dashboards avançados, permissões/equipes sofisticadas, infraestrutura distribuída e ampliação do tracking público.
- Escolha ou contratação de provedor, despesa, base legal, prazo de retenção ou política comercial.
- Remoção de código adiado que não reduza risco concreto.

## Contratos e critérios de aceite

### Público

- A revisão é produzida pelo servidor a partir de pacote, preço, duração, calendário e disponibilidade atuais; dados apresentados anteriormente pelo navegador não são autoridade.
- A confirmação revalida os termos revisados e rejeita revisão obsoleta sem criar reserva.
- Repetir a mesma intenção, inclusive após resposta perdida, devolve o mesmo resultado sem segunda reserva ou alocação.
- CPF, endereço, contato, placa, tokens e segredos não aparecem em URL, log, telemetria ou armazenamento do navegador.

### Administração

- Existe entrada de login utilizável no navegador; sessão, autorização e CSRF são revalidados no servidor em cada mutação.
- Lista e detalhe são navegáveis. Alteração de status e cancelamento acionam as capacidades transacionais existentes e deixam auditoria durável.
- Pacotes e calendário possuem navegação e operações essenciais para o piloto; conflitos preservam a configuração persistida.

### Produção mínima

- Startup de produção falha de forma segura se faltar configuração obrigatória; `/api/health` não expõe segredos e readiness testa a autoridade PostgreSQL.
- Logs operacionais usam allowlist e identificadores de correlação, sem PII. Limitação do controle em memória para uma única instância é explícita.
- Runbook exige HTTPS, PostgreSQL persistente, migração controlada, backup, teste de restore e rollback.
- Processamento real de CPF/PII permanece bloqueado até aprovação explícita dos gates jurídico, privacidade, retenção, backup e operação.

## Stack e comandos

- Next.js App Router 16.3.x, React 19.2.x, TypeScript 5.9, Node 24, PostgreSQL e `pg`.
- Unitário/integração: `npm.cmd test` e `npm.cmd test -- tests/integration`.
- Browser: `npm.cmd run test:browser`.
- Qualidade: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`.
- Segurança: `npm.cmd audit --omit=dev --audit-level=high`, `npm.cmd audit --audit-level=high`, `npm.cmd audit signatures`.

## Estrutura e estilo

- Route Handlers em `app/api`, UI em `app`/`src/app`, capacidades em `src/server/capabilities`, persistência em `src/server/persistence`, testes em `tests` e documentação em `docs`.
- Validar entradas com Zod nas bordas; manter SQL e transações no servidor; respostas públicas usam projeções mínimas e erros seguros.

```ts
const parsed = InputSchema.safeParse(await readBoundedJson(request));
if (!parsed.success) return safeJson({ error: "INVALID_REQUEST" }, 400);
await requireAuthorizedSession(request, "booking:update");
```

## Estratégia de teste

- RED → GREEN → REFACTOR para comportamento novo; teste focado após cada slice e suíte completa nos checkpoints.
- Integração real PostgreSQL para idempotência, concorrência, auditoria, retenção e readiness.
- Playwright real para confirmação pública, resposta perdida, login e operação administrativa; mocks apenas onde a dependência externa é deliberadamente a fronteira.
- Nenhum teste será desabilitado para obter verde. Bloqueio ambiental é separado de falha do produto.

## Limites

- Sempre: preservar a mudança preexistente em `tests/e2e/calendar-conflicts.spec.ts`, minimizar PII, validar autorização no servidor e manter o sistema compilável entre slices.
- Decisão humana: CPF/base legal/transparência, provedores e custos, OIDC/MFA operacional, bootstrap do primeiro OWNER, retenções ainda abertas, backup e restore reais, domínio/TLS e publicação.
- Nunca: push, merge, deploy, mudança de branch protection, operação Git destrutiva, segredo no repositório, `npm audit fix --force`, multi-tenancy ou funcionalidade fora do MVP.

## Contradições preservadas

- `tasks/todo.md` marca 47 tarefas como concluídas e `docs/release-readiness.md` registra readiness local, mas UI administrativa, E2E real, encerramento Playwright, vulnerabilidades e gates obrigatórios não sustentam conclusão integral.
- As marcações históricas permanecem como registro. O backlog corretivo da Sprint 01 passa a ser a fonte operacional até a revisão final.

## Definition of Done desta sprint

- Fluxos público e administrativo essenciais funcionam no navegador com PostgreSQL real.
- Idempotência, concorrência, reconciliação e resposta perdida têm evidência executada.
- Nenhum `high`/`critical` alcançável permanece sem correção ou mitigação aprovada.
- Testes, typecheck, lint, build e audits pertinentes passam; CI hospedado só é marcado verde após execução observada.
- Runbooks e configuração estão preparados, mas produção com dados reais continua bloqueada enquanto qualquer gate humano obrigatório estiver aberto.
