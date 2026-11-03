# Lava Auto Agendamento

Aplicação web para organizar agendamentos de um único estabelecimento de lavagem automotiva. Reúne escolha de serviço e horário, acompanhamento da reserva e operação administrativa em um mesmo projeto.

Projeto em desenvolvimento. A existência dos fluxos no código não equivale à homologação em produção. A demonstração usa ambiente local e dados sintéticos; a autenticação real OIDC/MFA e a integração completa dependem da configuração descrita nos guias.

## Funcionalidades existentes

- Catálogo de serviços, seleção de dia/horário, revisão e confirmação de agendamento no fluxo de desenvolvimento.
- Acompanhamento de reserva por código.
- Painel administrativo com agenda, lista/detalhe de reservas e alteração de status.
- Administração de estabelecimento, serviços, calendário e promoções.
- Controle de acesso administrativo, sessões e proteção CSRF; autenticação OIDC/MFA e um mecanismo separado de demonstração administrativa estritamente local.

Não há integração de pagamento anunciada aqui: registrar uma forma de pagamento não significa processar uma cobrança. Em modo de produção com tratamento de dados pessoais desabilitado, o fluxo público fica limitado à revisão demonstrativa, sem confirmação pessoal.

## Tecnologias e arquitetura

Next.js 16 (App Router), React 19, TypeScript, Node.js 24 e PostgreSQL. O acesso SQL usa `pg`, as migrations usam `node-pg-migrate` e a validação usa Zod. Vitest e Playwright compõem a estratégia de testes.

O servidor é organizado por capacidades de negócio, com persistência PostgreSQL e separação entre páginas, operações e acesso ao banco:

| Caminho | Responsabilidade |
| --- | --- |
| `app/` | Páginas, layouts e entradas HTTP dos fluxos público e administrativo |
| `src/server/capabilities/` | Catálogo, calendário, reservas, acompanhamento, administração e auditoria |
| `src/server/persistence/` | Conexões e transações PostgreSQL |
| `src/server/security/` | Controles compartilhados de segurança |
| `database/migrations/` | Evolução versionada do banco |
| `tests/` | Testes unitários, de contrato, integração e navegador |
| `scripts/` | Ferramentas de demonstração, diagnóstico e verificação |

Decisões e desenho detalhado estão em [docs/architecture/](docs/architecture/). Documentos com estado “Proposed” descrevem propostas e devem ser distinguidos da implementação existente.

## Executar localmente

Requisitos: Node.js **24.x**, npm **11.17.0**, PostgreSQL local e certificado HTTPS. Os testes de navegador também exigem Chromium do Playwright.

```bash
git clone https://github.com/llucalins/lava-auto-agendamento.git
cd lava-auto-agendamento
npm ci --ignore-scripts
```

Prepare o ambiente seguindo, nesta ordem:

1. [PostgreSQL local isolado](docs/postgresql-local-demo.md): banco de demonstração e roles separadas de aplicação, migrations e testes.
2. [Demonstração local](docs/demo-local-m2.md): arquivo privado `.env.demo.local`, certificado HTTPS e configuração OIDC/MFA.
3. [Catálogo sintético](docs/m2-demo-unblocking.md): preparação dos serviços e horários de demonstração.

Com esses pré-requisitos preparados:

```bash
npm run demo:check
npm run demo:start
```

Abra a origem HTTPS exibida pelo launcher. As entradas são `/`, `/booking`, `/tracking` e `/admin/login`. O launcher restringe a demo a `127.0.0.1:3000`, isola os arquivos de ambiente e recusa fallback HTTP. O diagnóstico pode encerrar com código 1 quando a preparação estiver incompleta.

Para explorar o painel com identidade sintética, siga [Acesso administrativo local](docs/local-admin-access.md). Esse mecanismo tem pré-requisitos próprios e não substitui OIDC/MFA em produção.

Use somente banco local de demonstração/testes e dados sintéticos. Não use credenciais de produção ou arquivos Neon para executar estes roteiros. Os comandos e caminhos acima foram conferidos com os scripts existentes; a execução completa da demo não foi repetida na preparação deste README.

## Verificações e testes

```bash
npm run lint
npm run typecheck
npm run build
```

Os testes estão separados em `tests/unit`, `tests/contract`, `tests/integration` e `tests/e2e`. `npm test` carrega `.env.local` quando presente; confira o destino antes de usá-lo. Integração e E2E requerem banco isolado e preparação específica.

Para uma verificação focada de políticas, sem carregar arquivos de ambiente nem acessar banco:

```bash
node node_modules/vitest/vitest.mjs run tests/unit/development-audit-policy.test.ts tests/unit/ci-policy.test.ts --configLoader native --no-cache --maxWorkers 1
```

Para integração e navegador, use os comandos com `.env.test.local` e a separação de roles do [guia de demonstração](docs/demo-local-m2.md#5-verificar-os-fluxos-automaticamente). `npm run test:browser` também existe; não o execute com um banco de destino desconhecido.

O registro histórico do M2 está em [Verificação M2](docs/m2-verification-2026-10-19.md). Ele descreve aquela etapa; resultados posteriores do modo administrativo local estão no respectivo guia. Nenhum desses registros comprova homologação atual de produção.
