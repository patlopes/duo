# ArtCraft nesta máquina

Verificado em 2026-11-06.

## O que existe

- `artcraft-launcher` 0.13: aplicativo gráfico que instala e atualiza os apps Craft. `--help` não imprime nada. A documentação em `/usr/share/doc/artcraft-launcher/README.md` não descreve nenhum modo de linha de comando.
- `~/.local/share/ArtCraft/versions` está vazio. O estúdio de IA ArtCraft, que o README do launcher descreve à parte ("AI image and video studio"), **não está instalado**.
- CLIs da suíte: `vectorcraft-cli`, `photocraft-cli`, `figcraft-cli`, `effectcraft-cli`, `texturecraft-cli`, `filmcraft-cli`, `soundcraft-cli`, `solidcraft-cli`, `solvecraft-cli`. São ferramentas de edição. A documentação do VectorCraft lista IA generativa como fora de escopo.

## Comandos usados

Renderizar um SVG para PNG (usado em `scripts/build-icons.mjs`):

```bash
vectorcraft-cli run --in assets/icon/master.svg --export saida.png
```

## O que falta decidir (bloqueia só a Fase 6)

A seção 8 do spec manda parar e perguntar quando não houver CLI. As opções para ícone final, splash, ilustrações e capas de sonhos:

1. Instalar o estúdio ArtCraft e verificar se ele tem modo headless.
2. Gerar localmente com o Z-Image-Turbo na GPU, sem custo por imagem. A pasta `tools/zimage` está vazia hoje, então é preciso conferir onde os pesos estão.
3. Desenhar vetores no `vectorcraft-cli`, como no mascote do Comeback.

O ícone atual é um placeholder: dois círculos sobrepostos em ameixa, em `assets/icon/master.svg`.
