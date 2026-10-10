<p align="center"><img src="assets/logo.svg" width="64" alt="Graticule-Logo"></p>

# Graticule

Ein Kartografie-Skill für Coding-Agenten: 1 Skill, 5 Kartentypen, 13 Regionen oder eigenes GeoJSON, 25 Regeln, 9 Sprachen. Er zeichnet keine schlechte Karte und sagt dir, warum.

> **Schnellstart.** Führe `npx skills add Arthur031221/Graticule` aus und bitte deinen Agenten: "Mach aus deaths.csv eine Karte der COVID-Todesfälle pro Land."

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

[![CI](https://github.com/Arthur031221/Graticule/actions/workflows/ci.yml/badge.svg)](https://github.com/Arthur031221/Graticule/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-c8412b?style=flat-square)](LICENSE) [![Live demo](https://img.shields.io/badge/live%20demo-open-c8412b?style=flat-square)](https://arthur031221.github.io/Graticule/)

<p align="center"><a href="https://arthur031221.github.io/Graticule/"><img src="assets/demo.gif" alt="Eine Karte mit vier Fehlern wird gestoppt, ein Klick behebt sie, dann wechseln die Beschriftungen die Sprache" width="860"></a></p>

**232 von 235** ISO-3166-Ländernamen finden allein über den Namen das richtige Polygon. Keiner das falsche. Ein exakter Abgleich mit dem englischen Namen in Natural Earth findet 202.
<sub>Namen aus datasets/country-codes (official_name_en), verbunden mit Natural Earth 1:50m. Falsche Zuordnungen werden gegen den ISO-Code jedes Namens gezählt. Fünf weitere öffentliche Listen ergeben dasselbe Bild, siehe [docs/verification.md](docs/verification.md).</sub>

| Ein Coding-Agent ohne den Skill | Derselbe Agent mit Graticule |
| --- | --- |
| <img src="assets/before.png" alt="Weltkarte der rohen COVID-Todeszahlen in sechs logarithmischen Stufen"> | <img src="assets/after.png" alt="Weltkarte der COVID-Todesfälle pro 100.000 Einwohner mit Legende, Quellenzeile und Punkten für kleine Länder"> |
| Hat die rohen Todeszahlen eingefärbt. Die Legende besteht aus logarithmischen Stufen von Zahlen, also sind die großen Länder dunkel. Keine Quellenzeile. | Hat durch die Einwohnerzahl geteilt, eine flächentreue Projektion verwendet, eine Quellenzeile ergänzt und die 14 nicht zugeordneten Zeilen namentlich aufgelistet. 22 Sekunden. |

Gleicher Prompt, gleiche Datei, frische Sitzungen desselben Agenten (Sonnet 5.5). Alle vier Sitzungen ohne den Skill haben rohe Zahlen eingefärbt: zwei mit diesem Agenten und zwei mit Codex. Die Protokolle liegen in [eval/runs](eval/runs).

Ich habe die Regeln geschrieben, die ein Agent überspringt, wenn er in Eile eine Karte zeichnet, und einen Renderer, der erst läuft, wenn sie erfüllt sind. Keine weitere Kartenbibliothek.

## Warum der Name

Ein Graticule ist das Gitter aus Breiten- und Längengraden auf einer Karte. Damit prüft der Leser, ob die Karte dort liegt, wo sie behauptet. Dieses Projekt tut dasselbe für Karten, die Agenten zeichnen. Die Fehler sind immer dieselben.

- **Absolute Zahlen statt Raten.** Länder nach ihren Todeszahlen einzufärben zeigt nur, wo die Menschen leben. Graticule verlangt eine Angabe zur Art (`kind`) oder bemerkt Werte, die wie die Einwohnerzahl geordnet sind, und teilt.
- **Mercator für die Welt.** Grönland so groß wie Afrika. Flächentreue Projektionen sind der Standard. Mercator wird ab 20 Breitengraden Ausdehnung abgelehnt.
- **Verschwindende Zeilen.** "Korea, Rep." passt nicht zu "South Korea" und niemand erfährt es. Jede Zeile, die sich nicht zuordnen lässt, wird mit den ähnlichsten Namen aufgelistet. Ein Name, der zu zwei Orten passt, wird nie geraten.
- **Dateien, die nicht UTF-8 sind.** Eine von einer Tabellenkalkulation unter Windows gespeicherte Tabelle ist oft Big5, Shift_JIS oder Windows-1252, und als UTF-8 gelesen passt keine Zeile. Graticule sagt, wenn eine Datei nicht UTF-8 ist, liest sie als Windows-1252 und nimmt `--encoding big5` oder `data.encoding` für den Rest.
- **Regenbogenpaletten.** Eine Helligkeit, die auf und ab geht, zeichnet Grenzen, die in den Daten nicht vorkommen. Die Palette muss gleichmäßig heller oder dunkler werden, und ihre Farben müssen für die drei Formen von Farbsehschwäche, die ich simuliere, auseinanderbleiben.
- **Beschriftungen, die zu leeren Kästchen werden.** Chinesische, japanische und koreanische Beschriftungen brauchen Schriften. Jede Ausgabe enthält eine Teilmenge von Noto Sans CJK mit nur den benutzten Zeichen.
- **Keine Quelle.** Eine Karte ohne Quellenzeile wird abgelehnt.

## Was geprüft wird

25 Regeln, jede mit einer klaren Begründung neben dem Befund. Fehler stoppen die Karte. `--fix` repariert die Fälle mit genau einer mechanischen Reparatur, und `--allow <id>` akzeptiert eine Regel und hinterlässt einen Vermerk im Bericht.

| Regel | Was sie findet |
| --- | --- |
| `source-required` | Eine Karte ohne Quellenzeile. |
| `title-required` | Eine Karte ohne Titel. |
| `legend-title` | Eine Legende, die nicht sagt, was die Zahlen sind. |
| `kind-undeclared` | Eine eingefärbte Karte, deren Werte absolute Zahlen sein könnten. |
| `table-ragged` | Tabellenzeilen mit falscher Zellenzahl. |
| `join-blank` | Zeilen mit leerem Gebietsnamen. |
| `join-failed` | Eine Schlüsselspalte, die meist zu keinem Gebiet passt. |
| `join-unmatched` | Zeilen ohne Treffer, mit den ähnlichsten Namen aufgelistet. |
| `join-ambiguous` | Namen, die zu mehr als einem Gebiet passen. |
| `duplicate-keys` | Mehrere Zeilen für ein Gebiet, etwa viele Jahre in einer Spalte. |
| `raw-counts` | Rohe Zahlen auf einer eingefärbten Karte. `--fix` teilt durch die Einwohnerzahl. |
| `projection-mercator` | Mercator bei einer Region über 20 Breitengraden. |
| `projection-not-equal-area` | Eine eingefärbte Karte einer großen Region in einer Projektion, die Flächen verzerrt. |
| `max-classes` | Mehr als 7 Klassen. |
| `class-breaks-coverage` | Grenzen, die manche Werte ohne Farbe lassen. |
| `empty-class` | Eine Legendenklasse, die kein Gebiet nutzt. |
| `skewed-classes` | Gleiche oder manuelle Klassen, bei denen der größte Teil der Karte in einer liegt. |
| `palette-order` | Eine Palette, die nicht gleichmäßig heller oder dunkler wird. |
| `cvd-separation` | Farben, die sich bei simulierter Farbsehschwäche zu nahe kommen. |
| `diverging-center` | Eine divergierende Palette ohne Mittelpunkt. |
| `too-many-categories` | Mehr als 8 Kategorien. |
| `normalize-missing` | Gebiete ohne Einwohnerzahl oder Fläche zum Teilen. |
| `values-skipped` | Zeilen, die ausgelassen wurden, weil eine Zelle keine Zahl ist oder ein Nenner fehlt oder null ist. |
| `no-data-share` | Eine Karte, die überwiegend grau ist. |
| `label-overlap` | Beschriftungen, die übereinander gedruckt werden. |

Die genauen Bedingungen und Schwellenwerte stehen in [docs/rules.md](docs/rules.md).

## Installation

<details open>
<summary><b>Codex und der oben verwendete Agent</b> (die beiden, die ich getestet habe)</summary>

```
npx skills add Arthur031221/Graticule
```

In einem Projekt schreibt der Befehl `.agents/skills/graticule`, das Codex liest, und verlinkt den Skill-Ordner der anderen Agenten, die du auswählst. Dann bittest du in normalen Worten um eine Karte.

</details>

<details>
<summary><b>Cursor, Gemini CLI, OpenCode und andere Agenten</b></summary>

Führe denselben Befehl aus und wähle deinen Agenten, wenn das Programm `skills` danach fragt. Diese Agenten habe ich nicht selbst laufen lassen. Hat dein Agent einen Skill-Ordner, kopiere `skills/graticule` hinein. Es sind etwa 14 MB, mehr braucht es nicht.

</details>

<details>
<summary><b>Chat-Apps, die einen Skill-Upload annehmen</b></summary>

Nach dem Klonen erstellst du `graticule-skill.zip` mit `npm run package:skill` oder holst es aus einem Release. Lade es dort hoch, wo die App einen eigenen Skill annimmt. Der Skill führt ein Programm aus, daher muss die Codeausführung aktiviert sein.

</details>

<details>
<summary><b>Nur die Kommandozeile</b></summary>

```
npx -y github:Arthur031221/Graticule render map.json
```

Oder klone das Repository und führe `node skills/graticule/scripts/graticule.mjs --help` aus. Node 20 oder neuer, kein Netzwerk.

</details>

<details>
<summary><b>Im Browser</b></summary>

Öffne den [Spielplatz](https://arthur031221.github.io/Graticule/). Lege eine CSV ab, behebe, was der Prüfer findet, und lade SVG, PNG, PDF oder eine interaktive HTML-Seite herunter. Alles läuft in der Seite, nichts wird hochgeladen. Die Oberfläche gibt es in neun Sprachen. Lege eine GeoJSON- oder TopoJSON-Datei neben die Tabelle, um eigene Grenzen zu zeichnen.

</details>

## Benutzung

<p align="center"><img src="assets/cli.gif" alt="graticule join, check und render --fix auf einer Tabelle der COVID-Todesfälle" width="860"></p>

```
graticule join deaths.csv --region world     # welche Zeilen zu welchen Gebieten passen, bevor etwas gezeichnet wird
graticule check map.json                     # jeder Befund mit seiner Begründung
graticule render map.json --fix -f svg,png   # die kleinste Reparatur für jeden Fehler, dann die Dateien
```

Eine Spezifikation ist eine kleine JSON-Datei:

```json
{
  "title": "COVID-19 deaths per 100,000 people",
  "source": "WHO COVID-19 dashboard, up to 2026-09-20",
  "region": "world",
  "data": { "file": "deaths.csv", "key": "country", "value": "deaths", "kind": "count" }
}
```

`render` schreibt `map.svg`, `map.png`, optional `map.pdf` und `map.html` sowie `map.check.json`. Der Bericht listet, was zugeordnet wurde, die Klassengrenzen und jeden Befund. Den vollständigen Durchgang findest du in [docs/usage.md](docs/usage.md), die Feldliste in [docs/config.md](docs/config.md).

## Karten und Regionen

Fünf Kartentypen: eingefärbte Flächen (Choroplethen), proportionale Kreise, Kategorien, Lagekarten mit kleinem Globus und Kleinserien, die sich eine Legende teilen. Dreizehn Regionen: die Welt, sechs Kontinente, US-Bundesstaaten und Countys (Alaska, Hawaii und Puerto Rico als Einschübe), Landkreise und Gemeinden Taiwans, Präfekturen Japans und Provinzen Südkoreas. Alles ist enthalten, das Zeichnen funktioniert also offline. Für jeden anderen Ort gibst du eine GeoJSON- oder TopoJSON-Datei an: `graticule init table.csv --boundaries states.geojson`. Jede Eigenschaft, die sich von Objekt zu Objekt unterscheidet, wird zu einem Schlüssel, und die Projektion ist eine flächentreue, die nach der Ausdehnung gewählt wird. Siehe [docs/config.md](docs/config.md).

| | | |
| --- | --- | --- |
| [<img src="docs/gallery/us-county-unemployment.png" alt="Arbeitslosigkeit nach County in den USA">](docs/gallery.md) | [<img src="docs/gallery/population-symbols.png" alt="Bevölkerung als proportionale Kreise">](docs/gallery.md) | [<img src="docs/gallery/fertility-small-multiples.png" alt="Geburtenraten in vier Kleinserien">](docs/gallery.md) |
| [<img src="docs/gallery/taiwan-township-area.png" alt="Gemeinden Taiwans auf Traditionellem Chinesisch">](docs/gallery.md) | [<img src="docs/gallery/japan-regions.png" alt="Präfekturen Japans nach Region">](docs/gallery.md) | [<img src="docs/gallery/brazil-state-density.png" alt="Bevölkerungsdichte Brasiliens, aus einer TopoJSON-Datei gezeichnet">](docs/gallery.md) |

[docs/gallery.md](docs/gallery.md) zeigt alle 17, jede mit dem Prompt, der sie angefordert hat, ihrer Spezifikation, ihren Daten und ihrem Prüfprotokoll.

## Beschriftungen in neun Sprachen

<p align="center"><img src="assets/languages.png" alt="Dieselbe Karte Europas in neun Sprachen beschriftet" width="860"></p>

Englisch, Traditionelles und Vereinfachtes Chinesisch, Japanisch, Koreanisch, Spanisch, Französisch, Deutsch und brasilianisches Portugiesisch. `--lang de` ändert die Beschriftungen der Karte und die Sprache der Meldungen. Der Spielplatz, die Meldungen und diese READMEs sind in jede Sprache übersetzt.

## Gegen echte Systeme geprüft

Jede Prüfung läuft aus einem Skript in diesem Repository. Die CI wiederholt die meisten. Zahlen und Methoden stehen in [docs/verification.md](docs/verification.md).

| Was | Verglichen mit | Ergebnis |
| --- | --- | --- |
| 12 Projektionen | PROJ 9.8.1, je 3.000 Punkte | 11 stimmen auf 0,00001 m überein, Robinson auf 10,2 km nach einem angepassten Maßstab |
| Quantil-, gleiche und Jenks-Klassen | mapclassify 2.11.0, 45 Fälle | gleiche Grenzen und Anzahlen, vor dem Runden der Legendengrenzen |
| CIELAB, CIEDE2000, Farbsehschwäche-Simulation | colour-science 0.4.7, colorspacious | innerhalb von 0,02 und innerhalb von 2 von 255 |
| Zuordnung über Namen | 6 öffentliche Länderlisten | keine falsche Zuordnung bei 1.301 Namen |
| Absolute Zahlen gegen Raten | 33 Indikatoren der Weltbank | 0 von 25 Raten markiert, 8 von 8 absoluten Zahlen erkannt |
| SVG, PDF und PNG | fontTools, pypdf, Pillow | alle Zeichen und Schriften eingebettet, Größen stimmen |

Die Agenten-Sitzungen sind eine kleine Stichprobe: zwei Prompts, zwei Agenten, je zwei Läufe. Lies sie als Beispiele. Die Prompts und ein Runner liegen in [eval](eval).

## Grenzen

- Die Grenzen stammen von Natural Earth (1:50m für Länder), aus den US-Zensusdateien von 2017 und aus den Dateien des taiwanischen Innenministeriums. Sie sind für Karten gezeichnet, nicht für die Vermessung. Französisch-Guayana, Martinique, Guadeloupe, Mayotte und Réunion gehören zu Frankreich. Gibraltar und Tokelau haben kein Polygon.
- Die US-Countys sind die von 2017, daher lassen sich die Planungsregionen Connecticuts und die neueren Zensusgebiete Alaskas nicht zuordnen.
- Die Gemeinden Taiwans haben nur englische und traditionell chinesische Namen. Japans Ogasawara- und Amami-Inseln und Taiwans Wuqiu werden nicht gezeichnet.
- Der Erkenner für absolute Zahlen ist eine Faustregel mit der Schwelle 0,6. Gib `data.kind` an, dann spielt er keine Rolle mehr.
- Eine Zelle wie `1,234` wird als 1234 gelesen, außer eine andere Zelle der Spalte zeigt Dezimalkommas. Die übrigen Regeln für Zahlen stehen in [docs/config.md](docs/config.md).
- Die Schriften decken die gängigen Zeichen jeder Sprache ab (zum Beispiel die 5.401 Zeichen der Big5-Stufe 1 für Traditionelles Chinesisch). Ein Zeichen außerhalb davon wird als `glyphs-missing` gemeldet. Schriften, die von rechts nach links laufen oder Formung brauchen, werden nicht unterstützt.
- In der US-Karte ist Alaska mit 35 Prozent des Maßstabs der 48 zusammenhängenden Staaten gezeichnet. Flächen sind innerhalb jedes Teils vergleichbar.
- Die Beschriftungen nutzen einen gierigen Platzierer. Dichte Karten lassen einige weg, und der Bericht zählt sie.
- Eigene Grenzen werden unverändert gezeichnet, ohne Vereinfachung: Eine Datei mit Millionen Stützpunkten zeichnet sich also langsam. Die Koordinaten müssen Längen- und Breitengrad sein. Damit `--fix` absolute Zahlen durch die Bevölkerung teilen kann, braucht die Datei eine Bevölkerungseigenschaft.

## Mehr

[Installation](docs/install.md), [Benutzung](docs/usage.md), [Konfiguration](docs/config.md), [Regionen](docs/regions.md), [Regeln](docs/rules.md), [Daten und Lizenzen](docs/data.md), [Architektur](docs/architecture.md), [Überprüfung](docs/verification.md), [Mitwirken](CONTRIBUTING.md), [Änderungsprotokoll](CHANGELOG.md).

Natural Earth, das US Census Bureau, das taiwanische Innenministerium, die Noto-Schriften, ColorBrewer, d3, pdfkit, resvg und HarfBuzz machen das möglich. Die Lizenzen stehen in [NOTICE.md](NOTICE.md).

MIT-Lizenz, siehe [LICENSE](LICENSE).

Assisted by Claude/Codex.
