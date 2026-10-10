<p align="center"><img src="assets/logo.svg" width="64" alt="Logo de Graticule"></p>

# Graticule

Une compétence de cartographie pour les agents de programmation : 1 compétence, 5 types de cartes, 13 régions ou votre propre GeoJSON, 25 règles, 9 langues. Elle refuse de dessiner une mauvaise carte et vous dit pourquoi.

> **Démarrage rapide.** Lancez `npx skills add Arthur031221/Graticule`, puis demandez à votre agent : « fais une carte des décès du COVID par pays à partir de deaths.csv ».

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

[![CI](https://github.com/Arthur031221/Graticule/actions/workflows/ci.yml/badge.svg)](https://github.com/Arthur031221/Graticule/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-c8412b?style=flat-square)](LICENSE) [![Live demo](https://img.shields.io/badge/live%20demo-open-c8412b?style=flat-square)](https://arthur031221.github.io/Graticule/) [![Release](https://img.shields.io/github/v/release/Arthur031221/Graticule?style=flat-square&color=c8412b)](https://github.com/Arthur031221/Graticule/releases)

<p align="center"><a href="https://arthur031221.github.io/Graticule/"><img src="assets/demo.gif" alt="Une carte avec quatre erreurs est bloquée, un clic la corrige, puis les étiquettes changent de langue" width="860"></a></p>

**232 noms de pays sur 235** de la norme ISO 3166 sont reliés au bon polygone par le nom seul. Aucun au mauvais. Une comparaison exacte avec le nom anglais de Natural Earth en trouve 202.
<sub>Noms issus de datasets/country-codes (official_name_en), joints à Natural Earth 1:50m. Les jointures fausses sont comptées d'après le code ISO de chaque nom. Cinq autres listes publiques donnent le même résultat, voir [docs/verification.md](docs/verification.md).</sub>

| Un agent de programmation, sans la compétence | Le même agent avec Graticule |
| --- | --- |
| <img src="assets/before.png" alt="Carte du monde des décès du COVID en effectifs bruts, en six classes logarithmiques"> | <img src="assets/after.png" alt="Carte du monde des décès du COVID pour 100 000 habitants, avec légende, source et points pour les petits pays"> |
| A colorié les effectifs bruts de décès. La légende est faite de classes logarithmiques d'effectifs, donc les grands pays sont les plus foncés. Pas de ligne de source. | A divisé par la population, utilisé une projection équivalente, ajouté une ligne de source et listé par nom les 14 lignes qui ne correspondaient pas. 22 secondes. |

Même consigne, même fichier, sessions neuves du même agent (Sonnet 5.5). Les quatre sessions sans la compétence ont colorié des effectifs bruts : deux avec cet agent et deux avec Codex. Les transcriptions sont dans [eval/runs](eval/runs).

J'ai écrit les règles qu'un agent saute quand il dessine une carte à la hâte, et un moteur de rendu qui ne tourne pas tant qu'elles ne sont pas respectées. Ce n'est pas une bibliothèque cartographique de plus.

## Pourquoi ce nom

Un graticule est le quadrillage des lignes de latitude et de longitude d'une carte. Le lecteur s'en sert pour vérifier que la carte est bien là où elle prétend être. Ce projet fait la même chose pour les cartes que dessinent les agents. Les erreurs sont toujours les mêmes.

- **Des effectifs au lieu de taux.** Colorier les pays selon leur nombre de décès montre où vivent les gens. Graticule demande de déclarer le type (`kind`), ou repère des valeurs qui se classent comme la population, et divise.
- **Mercator pour le monde.** Le Groenland aussi grand que l'Afrique. Les projections équivalentes sont le choix par défaut. Mercator est refusée au-delà de 20 degrés de latitude.
- **Des lignes qui disparaissent.** « Korea, Rep. » ne correspond pas à « South Korea » et personne n'est prévenu. Chaque ligne qui ne se joint pas est listée avec ses noms les plus proches. Un nom qui convient à deux endroits n'est jamais deviné.
- **Des fichiers qui ne sont pas en UTF-8.** Un tableau enregistré par un tableur sous Windows est souvent en Big5, Shift_JIS ou Windows-1252, et lu comme de l'UTF-8 il ne correspond à rien. Graticule signale qu'un fichier n'est pas en UTF-8, le lit comme du Windows-1252 et accepte `--encoding big5` ou `data.encoding` pour le reste.
- **Des palettes arc-en-ciel.** Une luminosité qui monte et descend dessine des frontières absentes des données. La palette doit s'éclaircir ou s'assombrir régulièrement, et ses couleurs doivent rester distinctes pour les trois types de daltonisme que je simule.
- **Des étiquettes qui deviennent des cases vides.** Les étiquettes en chinois, japonais et coréen ont besoin de polices. Chaque fichier de sortie embarque un sous-ensemble de Noto Sans CJK avec les seuls glyphes utilisés.
- **Pas de source.** Une carte sans ligne de source est refusée.

## Ce qu'elle vérifie

25 règles, chacune avec une raison claire affichée à côté du constat. Les erreurs bloquent la carte. `--fix` répare celles qui ont une seule réparation mécanique, et `--allow <id>` accepte une règle en laissant une note dans le rapport.

| Règle | Ce qu'elle détecte |
| --- | --- |
| `source-required` | Une carte sans ligne de source. |
| `title-required` | Une carte sans titre. |
| `legend-title` | Une légende qui ne dit pas ce que sont les nombres. |
| `kind-undeclared` | Une carte coloriée dont les valeurs pourraient être des effectifs. |
| `table-ragged` | Des lignes du tableau avec un nombre de cellules incorrect. |
| `join-blank` | Des lignes dont le nom de zone est vide. |
| `join-failed` | Une colonne clé qui ne correspond presque à aucune zone. |
| `join-unmatched` | Des lignes qui ne correspondent à rien, listées avec les noms les plus proches. |
| `join-ambiguous` | Des noms qui conviennent à plus d'une zone. |
| `duplicate-keys` | Plusieurs lignes pour une zone, comme plusieurs années dans une colonne. |
| `raw-counts` | Des effectifs bruts sur une carte coloriée. `--fix` divise par la population. |
| `projection-mercator` | Mercator sur une région de plus de 20 degrés de latitude. |
| `projection-not-equal-area` | Une carte coloriée d'une grande région dans une projection qui déforme les surfaces. |
| `max-classes` | Plus de 7 classes. |
| `class-breaks-coverage` | Des seuils qui laissent certaines valeurs sans couleur. |
| `empty-class` | Une classe de la légende qu'aucune zone n'utilise. |
| `skewed-classes` | Des classes égales ou manuelles avec la plus grande partie de la carte dans l'une d'elles. |
| `palette-order` | Une palette qui ne s'éclaircit ni ne s'assombrit régulièrement. |
| `cvd-separation` | Des couleurs trop proches sous simulation de daltonisme. |
| `diverging-center` | Une palette divergente sans valeur centrale. |
| `too-many-categories` | Plus de 8 catégories. |
| `normalize-missing` | Des zones sans population ni superficie pour diviser. |
| `values-skipped` | Lignes écartées parce qu'une cellule n'est pas un nombre ou qu'un dénominateur manque ou vaut zéro. |
| `no-data-share` | Une carte surtout grise. |
| `label-overlap` | Des étiquettes imprimées les unes sur les autres. |

Les conditions exactes et les seuils sont dans [docs/rules.md](docs/rules.md).

## Installation

<details open>
<summary><b>Codex et l'agent utilisé plus haut</b> (les deux que j'ai testés)</summary>

```
npx skills add Arthur031221/Graticule
```

Dans un projet, la commande écrit `.agents/skills/graticule`, que Codex lit, et lie le dossier de compétences des autres agents que vous choisissez. Demandez ensuite une carte avec des mots simples.

</details>

<details>
<summary><b>Cursor, Gemini CLI, OpenCode et autres agents</b></summary>

Lancez la même commande et choisissez votre agent quand le programme `skills` le demande. Je n'ai pas lancé ces agents moi-même. Si votre agent a un dossier de compétences, copiez-y `skills/graticule`. Il pèse environ 14 Mo et rien d'autre n'est nécessaire.

</details>

<details>
<summary><b>Applications de chat qui acceptent l'envoi d'une compétence</b></summary>

Après avoir cloné le dépôt, créez `graticule-skill.zip` avec `npm run package:skill`, ou récupérez-le dans une version publiée. Envoyez-le là où l'application accepte une compétence personnalisée. La compétence exécute un programme, donc l'exécution de code doit être activée.

</details>

<details>
<summary><b>Ligne de commande seule</b></summary>

```
npx -y github:Arthur031221/Graticule render map.json
```

Ou clonez le dépôt et lancez `node skills/graticule/scripts/graticule.mjs --help`. Node 20 ou plus récent, aucun réseau.

</details>

<details>
<summary><b>Dans le navigateur</b></summary>

Ouvrez le [bac à sable](https://arthur031221.github.io/Graticule/). Déposez un CSV, corrigez ce que trouve le vérificateur, puis téléchargez du SVG, du PNG, du PDF ou une page HTML interactive. Tout s'exécute dans la page et rien n'est envoyé. L'interface existe en neuf langues. Déposez un fichier GeoJSON ou TopoJSON à côté du tableau pour dessiner vos propres limites.

</details>

## Utilisation

<p align="center"><img src="assets/cli.gif" alt="graticule join, check et render --fix sur un tableau de décès du COVID" width="860"></p>

```
graticule join deaths.csv --region world     # quelles lignes correspondent à quelles zones, avant de dessiner quoi que ce soit
graticule check map.json                     # chaque constat, avec sa raison
graticule render map.json --fix -f svg,png   # la réparation minimale pour chaque erreur, puis les fichiers
```

Une spécification est un petit fichier JSON :

```json
{
  "title": "COVID-19 deaths per 100,000 people",
  "source": "WHO COVID-19 dashboard, up to 2026-09-20",
  "region": "world",
  "data": { "file": "deaths.csv", "key": "country", "value": "deaths", "kind": "count" }
}
```

`render` écrit `map.svg`, `map.png`, éventuellement `map.pdf` et `map.html`, et `map.check.json`. Le rapport liste ce qui a correspondu, les bornes des classes et chaque constat. Voir [docs/usage.md](docs/usage.md) pour le parcours complet et [docs/config.md](docs/config.md) pour la liste des champs.

## Cartes et régions

Cinq types de cartes : surfaces coloriées (choroplèthe), cercles proportionnels, catégories, cartes de situation avec un petit globe et petits multiples qui partagent une légende. Treize régions : le monde, six continents, les États et comtés des États-Unis (Alaska, Hawaï et Porto Rico en encarts), les comtés et cantons de Taïwan, les préfectures du Japon et les provinces de Corée du Sud. Tout est embarqué, donc le dessin fonctionne hors ligne. Pour tout autre lieu, donnez un fichier GeoJSON ou TopoJSON : `graticule init table.csv --boundaries states.geojson`. Chaque propriété qui diffère d'une entité à l'autre devient une clé, et la projection est une projection équivalente choisie selon l'étendue. Voir [docs/config.md](docs/config.md).

| | | |
| --- | --- | --- |
| [<img src="docs/gallery/us-county-unemployment.png" alt="Chômage par comté aux États-Unis">](docs/gallery.md) | [<img src="docs/gallery/population-symbols.png" alt="Population en cercles proportionnels">](docs/gallery.md) | [<img src="docs/gallery/fertility-small-multiples.png" alt="Taux de fécondité en quatre petits multiples">](docs/gallery.md) |
| [<img src="docs/gallery/taiwan-township-area.png" alt="Cantons de Taïwan en chinois traditionnel">](docs/gallery.md) | [<img src="docs/gallery/japan-regions.png" alt="Préfectures du Japon par région">](docs/gallery.md) | [<img src="docs/gallery/brazil-state-density.png" alt="Densité de population du Brésil, dessinée depuis un fichier TopoJSON">](docs/gallery.md) |

[docs/gallery.md](docs/gallery.md) contient les 17, chacune avec la consigne qui l'a demandée, sa spécification, ses données et son journal de vérification.

## Des étiquettes en neuf langues

<p align="center"><img src="assets/languages.png" alt="La même carte de l'Europe étiquetée en neuf langues" width="860"></p>

Anglais, chinois traditionnel et simplifié, japonais, coréen, espagnol, français, allemand et portugais du Brésil. `--lang fr` change les étiquettes de la carte et la langue des messages. Le bac à sable, les messages et ces README sont traduits dans chaque langue.

## Vérifié contre de vrais systèmes

Chaque vérification s'exécute depuis un script de ce dépôt. L'intégration continue en répète la plupart. Les chiffres et les méthodes sont dans [docs/verification.md](docs/verification.md).

| Quoi | Comparé avec | Résultat |
| --- | --- | --- |
| 12 projections | PROJ 9.8.1, 3 000 points chacune | 11 concordent à 0,00001 m, Robinson à 10,2 km après un facteur d'échelle ajusté |
| Classes par quantiles, égales et Jenks | mapclassify 2.11.0, 45 cas | mêmes bornes et mêmes effectifs, avant l'arrondi des bornes de la légende |
| CIELAB, CIEDE2000, simulation du daltonisme | colour-science 0.4.7, colorspacious | à 0,02 près et à 2 sur 255 près |
| Jointures par nom | 6 listes publiques de pays | aucune jointure fausse sur 1 301 noms |
| Effectifs et taux | 33 indicateurs de la Banque mondiale | 0 taux sur 25 signalé, 8 effectifs sur 8 détectés |
| SVG, PDF et PNG | fontTools, pypdf, Pillow | tous les glyphes et polices embarqués, tailles justes |

Les sessions avec des agents forment un petit échantillon : deux consignes, deux agents, deux exécutions chacun. Lisez-les comme des exemples. Les consignes et un lanceur sont dans [eval](eval).

## Limites

- Les frontières viennent de Natural Earth (1:50m pour les pays), des fichiers du recensement américain de 2017 et de ceux du ministère de l'Intérieur de Taïwan. Elles sont dessinées pour des cartes, pas pour l'arpentage. La Guyane, la Martinique, la Guadeloupe, Mayotte et La Réunion font partie de la France. Gibraltar et Tokelau n'ont pas de polygone.
- Les comtés américains sont ceux de 2017, donc les régions de planification du Connecticut et les zones de recensement plus récentes de l'Alaska ne se joignent pas.
- Les cantons de Taïwan n'ont que des noms anglais et en chinois traditionnel. Les îles Ogasawara et Amami au Japon et Wuqiu à Taïwan ne sont pas dessinées.
- Le détecteur d'effectifs est une heuristique avec un seuil de 0,6. Déclarez `data.kind` et il n'intervient plus.
- Une cellule comme `1,234` est lue comme 1234, sauf si une autre cellule de la colonne montre des virgules décimales. Les autres règles sur les nombres sont dans [docs/config.md](docs/config.md).
- Les polices couvrent les caractères courants de chaque langue (par exemple les 5 401 caractères du niveau 1 de Big5 pour le chinois traditionnel). Un caractère hors de cet ensemble est signalé par `glyphs-missing`. Les écritures de droite à gauche ou qui demandent une mise en forme complexe ne sont pas prises en charge.
- Sur la carte des États-Unis, l'Alaska est dessinée à 35 % de l'échelle des 48 États contigus. Les surfaces sont comparables à l'intérieur de chaque morceau.
- Les étiquettes utilisent un placement glouton. Les cartes denses en omettent certaines, et le rapport les compte.
- Vos propres limites sont dessinées telles quelles, sans simplification : un fichier de plusieurs millions de sommets se dessine lentement. Les coordonnées doivent être en longitude et latitude. Il faut une propriété de population pour que `--fix` divise les effectifs bruts.

## Pour aller plus loin

[Installation](docs/install.md), [utilisation](docs/usage.md), [configuration](docs/config.md), [régions](docs/regions.md), [règles](docs/rules.md), [données et licences](docs/data.md), [architecture](docs/architecture.md), [vérification](docs/verification.md), [contribuer](CONTRIBUTING.md), [journal des modifications](CHANGELOG.md).

Natural Earth, le Bureau du recensement des États-Unis, le ministère de l'Intérieur de Taïwan, les polices Noto, ColorBrewer, d3, pdfkit, resvg et HarfBuzz rendent ce projet possible. Les licences sont dans [NOTICE.md](NOTICE.md).

Licence MIT, voir [LICENSE](LICENSE).

Assisted by Claude/Codex.
