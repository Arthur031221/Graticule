<p align="center"><img src="assets/logo.svg" width="64" alt="Logotipo do Graticule"></p>

# Graticule

Uma habilidade de cartografia para agentes de programação: 1 habilidade, 5 tipos de mapa, 13 regiões ou seu próprio GeoJSON, 25 regras, 9 idiomas. Ela não desenha um mapa ruim e diz por quê.

> **Início rápido.** Execute `npx skills add Arthur031221/Graticule` e peça ao seu agente: "faça um mapa das mortes por COVID por país com deaths.csv".

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

[![CI](https://github.com/Arthur031221/Graticule/actions/workflows/ci.yml/badge.svg)](https://github.com/Arthur031221/Graticule/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-c8412b?style=flat-square)](LICENSE) [![Live demo](https://img.shields.io/badge/live%20demo-open-c8412b?style=flat-square)](https://arthur031221.github.io/Graticule/) [![Release](https://img.shields.io/github/v/release/Arthur031221/Graticule?style=flat-square&color=c8412b)](https://github.com/Arthur031221/Graticule/releases)

<p align="center"><a href="https://arthur031221.github.io/Graticule/"><img src="assets/demo.gif" alt="Um mapa com quatro erros é bloqueado, um clique o corrige e depois os rótulos trocam de idioma" width="860"></a></p>

**232 de 235** nomes de países da ISO 3166 chegam ao polígono certo só pelo nome. Nenhum ao errado. A comparação exata com o nome em inglês do Natural Earth acha 202.
<sub>Nomes de datasets/country-codes (official_name_en), unidos ao Natural Earth 1:50m. As uniões erradas são contadas contra o código ISO de cada nome. Outras cinco listas públicas dão o mesmo resultado, veja [docs/verification.md](docs/verification.md).</sub>

| Um agente de programação, sem a habilidade | O mesmo agente com o Graticule |
| --- | --- |
| <img src="assets/before.png" alt="Mapa-múndi de contagens brutas de mortes por COVID em seis faixas logarítmicas"> | <img src="assets/after.png" alt="Mapa-múndi de mortes por COVID por 100.000 habitantes, com legenda, fonte e pontos para os países pequenos"> |
| Coloriu as contagens brutas de mortes. A legenda são faixas logarítmicas de contagens, então os países grandes ficam escuros. Sem linha de fonte. | Dividiu pela população, usou uma projeção de área equivalente, acrescentou uma linha de fonte e listou pelo nome as 14 linhas que não casaram. 22 segundos. |

Mesmo pedido, mesmo arquivo, sessões novas do mesmo agente (Sonnet 5.5). As quatro sessões sem a habilidade coloriram contagens brutas: duas com esse agente e duas com o Codex. As transcrições estão em [eval/runs](eval/runs).

Escrevi as regras que um agente pula quando desenha um mapa com pressa, e um renderizador que só roda quando elas passam. Não é mais uma biblioteca de mapas.

## Por que o nome

Um graticule é a grade de linhas de latitude e longitude de um mapa. É com ela que o leitor confere se o mapa está onde diz estar. Este projeto faz o mesmo com os mapas que os agentes desenham. Os erros são sempre os mesmos.

- **Contagens em vez de taxas.** Colorir os países pelo número de mortes mostra onde as pessoas moram. O Graticule pede que se declare o tipo (`kind`), ou percebe valores que se ordenam como a população, e divide.
- **Mercator para o mundo.** A Groenlândia do tamanho da África. As projeções de área equivalente são o padrão. A Mercator é recusada acima de 20 graus de latitude.
- **Linhas que somem.** "Korea, Rep." não casa com "South Korea" e ninguém é avisado. Toda linha que não se une aparece numa lista com os nomes mais próximos. Um nome que serve a dois lugares nunca é adivinhado.
- **Arquivos que não são UTF-8.** Uma tabela salva por uma planilha no Windows costuma ser Big5, Shift_JIS ou Windows-1252, e lida como UTF-8 não casa com nada. O Graticule avisa quando um arquivo não é UTF-8, lê como Windows-1252 e aceita `--encoding big5` ou `data.encoding` para o resto.
- **Paletas arco-íris.** Uma luminosidade que sobe e desce desenha fronteiras que não estão nos dados. A paleta precisa clarear ou escurecer de forma constante, e suas cores precisam continuar separadas para os três tipos de daltonismo que simulo.
- **Rótulos que viram quadrados vazios.** Rótulos em chinês, japonês e coreano precisam de fontes. Cada saída leva um subconjunto do Noto Sans CJK só com os glifos que usa.
- **Sem fonte.** Um mapa sem linha de fonte é recusado.

## O que ele verifica

25 regras, cada uma com um motivo claro mostrado junto ao achado. Os erros param o mapa. O `--fix` repara os que têm um único reparo mecânico, e o `--allow <id>` aceita uma regra deixando uma nota no relatório.

| Regra | O que ela pega |
| --- | --- |
| `source-required` | Um mapa sem linha de fonte. |
| `title-required` | Um mapa sem título. |
| `legend-title` | Uma legenda que não diz o que são os números. |
| `kind-undeclared` | Um mapa colorido cujos valores podem ser contagens. |
| `table-ragged` | Linhas da tabela com número de células errado. |
| `join-blank` | Linhas com o nome da área vazio. |
| `join-failed` | Uma coluna-chave que quase não casa com nenhuma área. |
| `join-unmatched` | Linhas que não casam com nada, listadas com os nomes mais próximos. |
| `join-ambiguous` | Nomes que servem a mais de uma área. |
| `duplicate-keys` | Várias linhas para uma área, como muitos anos numa coluna. |
| `raw-counts` | Contagens brutas num mapa colorido. O `--fix` divide pela população. |
| `projection-mercator` | Mercator numa região de mais de 20 graus de latitude. |
| `projection-not-equal-area` | Um mapa colorido de uma região grande numa projeção que distorce a área. |
| `max-classes` | Mais de 7 classes. |
| `class-breaks-coverage` | Quebras que deixam alguns valores sem cor. |
| `empty-class` | Uma classe da legenda que nenhuma área usa. |
| `skewed-classes` | Classes iguais ou manuais com a maior parte do mapa numa só. |
| `palette-order` | Uma paleta que não clareia nem escurece de forma constante. |
| `cvd-separation` | Cores que ficam próximas demais na simulação de daltonismo. |
| `diverging-center` | Uma paleta divergente sem ponto médio. |
| `too-many-categories` | Mais de 8 categorias. |
| `normalize-missing` | Áreas sem população nem superfície para dividir. |
| `values-skipped` | Linhas omitidas porque uma célula não é um número ou falta o denominador ou ele é zero. |
| `no-data-share` | Um mapa que é em grande parte cinza. |
| `label-overlap` | Rótulos impressos uns sobre os outros. |

As condições exatas e os limites estão em [docs/rules.md](docs/rules.md).

## Instalação

<details open>
<summary><b>Codex e o agente usado acima</b> (os dois que testei)</summary>

```
npx skills add Arthur031221/Graticule
```

Num projeto, o comando escreve `.agents/skills/graticule`, que o Codex lê, e vincula a pasta de habilidades dos outros agentes que você escolher. Depois peça um mapa com palavras comuns.

</details>

<details>
<summary><b>Cursor, Gemini CLI, OpenCode e outros agentes</b></summary>

Execute o mesmo comando e escolha seu agente quando o programa `skills` perguntar. Não executei esses agentes eu mesmo. Se o seu agente tem uma pasta de habilidades, copie `skills/graticule` para ela. Ocupa cerca de 14 MB e não é preciso mais nada.

</details>

<details>
<summary><b>Aplicativos de chat que aceitam o envio de uma habilidade</b></summary>

Depois de clonar o repositório, gere o `graticule-skill.zip` com `npm run package:skill` ou pegue-o numa versão publicada. Envie-o onde o aplicativo aceita uma habilidade personalizada. A habilidade executa um programa, então a execução de código precisa estar ligada.

</details>

<details>
<summary><b>Só a linha de comando</b></summary>

```
npx -y github:Arthur031221/Graticule render map.json
```

Ou clone o repositório e execute `node skills/graticule/scripts/graticule.mjs --help`. Node 20 ou mais novo, sem rede.

</details>

<details>
<summary><b>No navegador</b></summary>

Abra o [playground](https://arthur031221.github.io/Graticule/). Solte um CSV, corrija o que o verificador achar e baixe SVG, PNG, PDF ou uma página HTML interativa. Tudo roda na página e nada é enviado. A interface está em nove idiomas. Solte um arquivo GeoJSON ou TopoJSON ao lado da tabela para desenhar seus próprios limites.

</details>

## Uso

<p align="center"><img src="assets/cli.gif" alt="graticule join, check e render --fix numa tabela de mortes por COVID" width="860"></p>

```
graticule join deaths.csv --region world     # quais linhas casam com quais áreas, antes de desenhar qualquer coisa
graticule check map.json                     # cada achado, com o seu motivo
graticule render map.json --fix -f svg,png   # o menor reparo para cada erro, depois os arquivos
```

Uma especificação é um pequeno arquivo JSON:

```json
{
  "title": "COVID-19 deaths per 100,000 people",
  "source": "WHO COVID-19 dashboard, up to 2026-09-20",
  "region": "world",
  "data": { "file": "deaths.csv", "key": "country", "value": "deaths", "kind": "count" }
}
```

O `render` escreve `map.svg`, `map.png`, opcionalmente `map.pdf` e `map.html`, e `map.check.json`. O relatório lista o que casou, os limites das classes e cada achado. Veja [docs/usage.md](docs/usage.md) para o passo a passo completo e [docs/config.md](docs/config.md) para a lista de campos.

## Mapas e regiões

Cinco tipos de mapa: áreas coloridas (coroplético), círculos proporcionais, categorias, mapas de localização com um pequeno globo e pequenos múltiplos que compartilham uma legenda. Treze regiões: o mundo, seis continentes, estados e condados dos Estados Unidos (Alasca, Havaí e Porto Rico como quadros menores), condados e municípios de Taiwan, prefeituras do Japão e províncias da Coreia do Sul. Tudo vem incluído, então o desenho funciona offline. Para qualquer outro lugar, passe um arquivo GeoJSON ou TopoJSON: `graticule init table.csv --boundaries states.geojson`. Cada propriedade que difere entre as feições vira uma chave, e a projeção é uma de áreas iguais escolhida pela extensão. Veja [docs/config.md](docs/config.md).

| | | |
| --- | --- | --- |
| [<img src="docs/gallery/us-county-unemployment.png" alt="Desemprego por condado nos Estados Unidos">](docs/gallery.md) | [<img src="docs/gallery/population-symbols.png" alt="População como círculos proporcionais">](docs/gallery.md) | [<img src="docs/gallery/fertility-small-multiples.png" alt="Taxas de fecundidade em quatro pequenos múltiplos">](docs/gallery.md) |
| [<img src="docs/gallery/taiwan-township-area.png" alt="Municípios de Taiwan em chinês tradicional">](docs/gallery.md) | [<img src="docs/gallery/japan-regions.png" alt="Prefeituras do Japão por região">](docs/gallery.md) | [<img src="docs/gallery/brazil-state-density.png" alt="Densidade populacional do Brasil, desenhada a partir de um arquivo TopoJSON">](docs/gallery.md) |

[docs/gallery.md](docs/gallery.md) tem os 17, cada um com o pedido que o originou, sua especificação, seus dados e seu registro de verificação.

## Rótulos em nove idiomas

<p align="center"><img src="assets/languages.png" alt="O mesmo mapa da Europa com rótulos em nove idiomas" width="860"></p>

Inglês, chinês tradicional e simplificado, japonês, coreano, espanhol, francês, alemão e português do Brasil. O `--lang pt-BR` troca os rótulos do mapa e o idioma das mensagens. O playground, as mensagens e estes READMEs estão traduzidos para cada idioma.

## Verificado contra sistemas reais

Cada verificação roda a partir de um script deste repositório. A integração contínua repete a maioria. Os números e os métodos estão em [docs/verification.md](docs/verification.md).

| O quê | Comparado com | Resultado |
| --- | --- | --- |
| 12 projeções | PROJ 9.8.1, 3.000 pontos cada | 11 concordam até 0,00001 m, a Robinson até 10,2 km depois de ajustar uma escala |
| Classes por quantis, iguais e Jenks | mapclassify 2.11.0, 45 casos | mesmos limites e contagens, antes de arredondar os limites da legenda |
| CIELAB, CIEDE2000, simulação de daltonismo | colour-science 0.4.7, colorspacious | dentro de 0,02 e dentro de 2 de 255 |
| Uniões por nome | 6 listas públicas de países | nenhuma união errada em 1.301 nomes |
| Contagens contra taxas | 33 indicadores do Banco Mundial | 0 de 25 taxas apontadas, 8 de 8 contagens detectadas |
| SVG, PDF e PNG | fontTools, pypdf, Pillow | todos os glifos e fontes incorporados, tamanhos certos |

As sessões com agentes são uma amostra pequena: dois pedidos, dois agentes, duas execuções cada. Leia-as como exemplos. Os pedidos e um executor estão em [eval](eval).

## Limites

- As fronteiras vêm do Natural Earth (1:50m para os países), dos arquivos do censo dos Estados Unidos de 2017 e dos do Ministério do Interior de Taiwan. São desenhadas para mapas e não servem para agrimensura. A Guiana Francesa, a Martinica, Guadalupe, Mayotte e Reunião fazem parte da França. Gibraltar e Tokelau não têm polígono.
- Os condados dos Estados Unidos são os de 2017, então as regiões de planejamento de Connecticut e as áreas censitárias mais novas do Alasca não se unem.
- Os municípios de Taiwan só têm nomes em inglês e em chinês tradicional. As ilhas Ogasawara e Amami do Japão e Wuqiu, em Taiwan, não são desenhadas.
- O detector de contagens é uma heurística com limite de 0,6. Declare `data.kind` e ele sai de cena.
- Uma célula como `1,234` é lida como 1234, a menos que outra célula da coluna mostre vírgulas decimais. As demais regras para números estão em [docs/config.md](docs/config.md).
- As fontes cobrem os caracteres comuns de cada idioma (por exemplo, os 5.401 caracteres do nível 1 do Big5 para o chinês tradicional). Um caractere fora desse conjunto é informado como `glyphs-missing`. Escritas da direita para a esquerda ou que exigem composição não são suportadas.
- No mapa dos Estados Unidos, o Alasca é desenhado a 35% da escala dos 48 estados contíguos. As áreas são comparáveis dentro de cada parte.
- Os rótulos usam um posicionador guloso. Mapas densos deixam alguns de fora, e o relatório os conta.
- Seus próprios limites são desenhados como vieram. Um arquivo muito grande é lento e usa muita memória, então simplifique-o antes, por exemplo com o mapshaper. As coordenadas devem ser longitude e latitude. É preciso uma propriedade de população para o `--fix` dividir as contagens brutas.

## Mais

[Instalação](docs/install.md), [uso](docs/usage.md), [configuração](docs/config.md), [regiões](docs/regions.md), [regras](docs/rules.md), [dados e licenças](docs/data.md), [arquitetura](docs/architecture.md), [verificação](docs/verification.md), [como contribuir](CONTRIBUTING.md), [histórico de mudanças](CHANGELOG.md).

Natural Earth, o Censo dos Estados Unidos, o Ministério do Interior de Taiwan, as fontes Noto, ColorBrewer, d3, pdfkit, resvg e HarfBuzz tornam isto possível. As licenças estão em [NOTICE.md](NOTICE.md).

Licença MIT, veja [LICENSE](LICENSE).

Assisted by Claude/Codex.
