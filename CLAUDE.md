# Meu Bem (codinome Duo)

PWA que responde o que um casal precisa pagar **junto**: renda somada, contas, quanto cabe a cada um e quanto sobra. Não é rastreador de gastos individuais. iPhone primeiro, local-first, sem servidor.

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
- `npm run mascots`: regenera `public/mascots` a partir de `assets/mascots`
- `npm run release`: publica o commit atual no GitHub Pages (exige árvore limpa)
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
- Sem servidor: os celulares usam a mesma planilha Google (`src/io/sheetSync.ts`) ou trocam mensagem (`src/io/coupleSync.ts`). Toda entidade já nasce com UUID v7, `createdAt`/`updatedAt`/`deletedAt` e `householdId`.

## Publicação

- GitHub Pages em https://patlopes.github.io/duo/, servido da branch `gh-pages`. Só `npm run release` publica, a partir de um commit e com a árvore limpa.
- O repo é público: nada de dados reais, chaves ou caminhos sensíveis em código, docs ou screenshots.
- Depois que houver dados reais, publique só o que foi aceito, e nunca mude a origem sem um plano de backup e restauração.

## Armadilhas conhecidas

- Hooks de overlay do Ionic ignoram um novo overlay enquanto o anterior está aberto: use `useToast`, e um `useIonAlert` por alerta encadeado.
- `Field` só usa `<label>` em volta de um controle nativo: em volta de botões, tocar na legenda aciona o primeiro.
- `ion-toast` guarda a mensagem no shadow DOM e fica sempre no DOM: nos testes use `getByText` e visibilidade, nunca `hasText` ou `count()`.
- Estado inicial lido de `useData()` pode congelar um valor de antes do onboarding: derive em vez de guardar.
- Páginas ocultas ficam no DOM, então `.first()` pode pegar uma cópia invisível.
- `IonTabBar` descarta filhos que não sejam tab button. Componentes próprios precisam de `isTabButton = true`.
- `ion-title size="large"` é propriedade, não atributo: nos testes, selecione por `.title-large`.
- Variáveis de overlays do Ionic (action sheet) são declaradas em seletor com escopo, e só um seletor mais específico as sobrescreve.
- Toda cor nova de fundo ou texto usada pelo Ionic precisa da variante `-rgb`, ou a translucidez volta a ser branca no modo escuro.
- O Playwright no Linux não tem safe area nem standalone. `e2e/helpers.ts` simula o notch; o resto só no iPhone real.
- A raiz do disco está quase cheia: caches de npm e navegadores ficam em `../tools/`.
- Rotas com `React.lazy` deixam a tela em branco e sem voltar enquanto carregam: páginas roteadas são importadas direto.
- Voltar restaura a rolagem e esconde o large title: nos testes de navegação, confira o título da toolbar.
- `page.route` não enxerga `fetch` da página com service worker ativo no WebKit: simule com `addInitScript`.
- O escopo `drive.file` é por pessoa: quem foi convidado só acessa a planilha depois de escolhê-la no Google Picker. O token do Google só renova dentro de um toque, porque abre uma janela.
- O client secret do Google nunca entra no repositório: o app não usa.
- Abra os screenshots antes de dar uma fase por pronta: a tab bar branca no escuro e os rótulos quebrados passaram nos testes.
