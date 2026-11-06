# Meu Bem (codinome Duo)

PWA de finanças para um casal que divide despesas proporcionalmente à renda. iPhone primeiro, local-first, sem servidor na v1.

## Convenções

- Conversa com o Patrick em português. Código, nomes de arquivo, tipos e commits em inglês. Texto de interface em pt-BR, falando com o casal ("vocês").
- Commits convencionais (`feat:`, `fix:`, `chore:`…). Push por SSH; o token do `gh` não tem o escopo `workflow`.
- Nome do app só em `src/brand.ts` (mais `index.html`). IDs técnicos (`duo-backup`, `duo-changeset`, banco `duo`) nunca mudam com a marca.
- Dinheiro é sempre inteiro em centavos, nunca float. `*Cents` ≥ 0; o tipo do lançamento define o sinal.
- Lógica financeira é função pura em `src/domain`, sem React e sem Dexie, com teste.
- Cores só por token (`src/ui/tokens.css`). Texto usa `--text-*`; ícones, barras e gráficos usam `--fill-*`. Os pares são medidos em `src/ui/tokens.test.ts`.
- Não invente API do Safari/iOS: teste em `/debug` e peça para o Patrick abrir no iPhone.

## Comandos

- `npm run dev`: servidor de desenvolvimento
- `npm run build`: typecheck e build de produção
- `npm test`, `npm run test:cov`: Vitest
- `npm run e2e`: Playwright WebKit sobre o build (rode `npm run build` antes)
- `npm run lint`, `npm run typecheck`, `npm run check:bundle`
- `npm run icons`: regenera `public/icons` a partir de `assets/icon/master.svg`
- `npm run release`: publica o commit atual em https://financas.patricklopes.cloud (exige árvore limpa)
- `npm run serve:release`: o servidor estático; em produção roda como `duo-site.service`
- `npm run setup:webkit`: prepara o WebKit nesta máquina, que não tem sudo nem `libavif16`

## Arquitetura

- `src/domain`: regras de negócio puras
- `src/schemas`: Zod, fonte da verdade dos tipos
- `src/db`: Dexie e repositórios
- `src/io`: export, import, change-set, OFX, CSV
- `src/features/*`: telas, por área
- `src/ui`: design system
- `src/pwa`: service worker, instalação, diagnóstico
- UI: Ionic React em modo `ios`, com react-router 6. Rotas em `App.tsx` e `features/shell/TabsLayout.tsx`.
- Sem sync até a Fase 7, mas toda entidade já nasce com UUID v7, `createdAt`/`updatedAt`/`deletedAt` e `householdId`.

## Publicação

- Túnel `duo` (`~/.cloudflared/duo.yml`) → `127.0.0.1:4180` → `scripts/serve-release.mjs` → `../duo-release/current`. Serviços de usuário: `duo-site.service` e `duo-tunnel.service`.
- `dist/` nunca vai para o ar sem `npm run release`. Depois que houver dados reais, publique só o que foi aceito.

## Armadilhas conhecidas

- `IonTabBar` descarta filhos que não sejam tab button. Componentes próprios precisam de `isTabButton = true`.
- `ion-title size="large"` é propriedade, não atributo: nos testes, selecione por `.title-large`.
- Variáveis de overlays do Ionic (action sheet) são declaradas em seletor com escopo, e só um seletor mais específico as sobrescreve.
- Toda cor nova de fundo ou texto usada pelo Ionic precisa da variante `-rgb`, ou a translucidez volta a ser branca no modo escuro.
- O Playwright no Linux não tem safe area nem standalone. `e2e/helpers.ts` simula o notch; o resto só no iPhone real.
- A raiz do disco está quase cheia: caches de npm e navegadores ficam em `../tools/`.
- Abra os screenshots antes de dar uma fase por pronta: a tab bar branca no escuro e os rótulos quebrados passaram nos testes.
