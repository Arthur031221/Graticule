<p align="center"><img src="assets/logo.svg" width="64" alt="Logotipo de Graticule"></p>

# Graticule

Una habilidad de cartografía para agentes de programación: 1 habilidad, 5 tipos de mapa, 13 regiones o tu propio GeoJSON, 25 reglas, 9 idiomas. No dibuja un mapa defectuoso y te dice por qué.

> **Inicio rápido.** Ejecuta `npx skills add Arthur031221/Graticule` y pide a tu agente: "haz un mapa de las muertes por COVID por país con deaths.csv".

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

[![CI](https://github.com/Arthur031221/Graticule/actions/workflows/ci.yml/badge.svg)](https://github.com/Arthur031221/Graticule/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-c8412b?style=flat-square)](LICENSE) [![Live demo](https://img.shields.io/badge/live%20demo-open-c8412b?style=flat-square)](https://arthur031221.github.io/Graticule/)

<p align="center"><a href="https://arthur031221.github.io/Graticule/"><img src="assets/demo.gif" alt="Un mapa con cuatro errores se bloquea, un clic lo arregla y después las etiquetas cambian de idioma" width="860"></a></p>

**232 de 235** nombres de países de la norma ISO 3166 se asocian al polígono correcto solo por el nombre. Ninguno a uno equivocado. Comparar con el nombre en inglés de Natural Earth encuentra 202.
<sub>Nombres de datasets/country-codes (official_name_en), unidos a Natural Earth 1:50m. Las uniones erróneas se cuentan contra el código ISO de cada nombre. Otras cinco listas públicas dan el mismo resultado, ver [docs/verification.md](docs/verification.md).</sub>

| Un agente de programación, sin la habilidad | El mismo agente con Graticule |
| --- | --- |
| <img src="assets/before.png" alt="Mapa mundial de recuentos brutos de muertes por COVID en seis tramos logarítmicos"> | <img src="assets/after.png" alt="Mapa mundial de muertes por COVID por cada 100.000 personas, con leyenda, fuente y puntos para los países pequeños"> |
| Coloreó los recuentos brutos de muertes. La leyenda son tramos logarítmicos de recuentos, así que los países grandes salen oscuros. Sin línea de fuente. | Dividió por la población, usó una proyección de área equivalente, añadió una línea de fuente y enumeró por nombre las 14 filas que no coincidieron. 22 segundos. |

Mismo mensaje, mismo archivo, sesiones nuevas del mismo agente (Sonnet 5.5). Las cuatro sesiones sin la habilidad colorearon recuentos brutos: dos con ese agente y dos con Codex. Las transcripciones están en [eval/runs](eval/runs).

Escribí las reglas que un agente se salta cuando dibuja un mapa con prisa, y un renderizador que no se ejecuta hasta que se cumplen. No es otra biblioteca de mapas.

## Por qué el nombre

Una retícula (graticule) es la cuadrícula de líneas de latitud y longitud de un mapa. Con ella el lector comprueba que el mapa está donde dice estar. Este proyecto hace lo mismo con los mapas que dibujan los agentes. Los errores son siempre los mismos.

- **Recuentos en lugar de tasas.** Colorear los países por su número de muertes muestra dónde vive la gente. Graticule pide que se declare el tipo (`kind`), o detecta valores que se ordenan como la población, y divide.
- **Mercator para el mundo.** Groenlandia tan grande como África. Las proyecciones de área equivalente son la opción por defecto. Mercator se rechaza por encima de los 20 grados de latitud.
- **Filas que desaparecen.** "Korea, Rep." no coincide con "South Korea" y nadie se entera. Cada fila que no se une aparece en una lista con los nombres más parecidos. Un nombre que encaja en dos sitios nunca se adivina.
- **Archivos que no son UTF-8.** Una tabla guardada por una hoja de cálculo en Windows suele estar en Big5, Shift_JIS o Windows-1252, y leída como UTF-8 no cruza con nada. Graticule avisa cuando un archivo no es UTF-8, lo lee como Windows-1252 y acepta `--encoding big5` o `data.encoding` para el resto.
- **Paletas arcoíris.** Una luminosidad que sube y baja dibuja bordes que no están en los datos. La paleta debe aclararse u oscurecerse de forma constante, y sus colores deben seguir separados para los tres tipos de daltonismo que simulo.
- **Etiquetas que se vuelven cuadros vacíos.** Las etiquetas en chino, japonés y coreano necesitan fuentes. Cada salida lleva un subconjunto de Noto Sans CJK con solo los glifos que usa.
- **Sin fuente.** Un mapa sin línea de fuente se rechaza.

## Qué comprueba

25 reglas, cada una con una razón clara que se muestra junto al hallazgo. Los errores detienen el mapa. `--fix` repara los que tienen una sola reparación mecánica y `--allow <id>` acepta una regla dejando una nota en el informe.

| Regla | Qué detecta |
| --- | --- |
| `source-required` | Un mapa sin línea de fuente. |
| `title-required` | Un mapa sin título. |
| `legend-title` | Una leyenda que no dice qué son los números. |
| `kind-undeclared` | Un mapa coloreado cuyos valores podrían ser recuentos. |
| `table-ragged` | Filas de la tabla con un número de celdas incorrecto. |
| `join-blank` | Filas con el nombre de zona vacío. |
| `join-failed` | Una columna clave que casi nunca coincide con una zona. |
| `join-unmatched` | Filas que no coinciden con nada, con los nombres más parecidos. |
| `join-ambiguous` | Nombres que encajan en más de una zona. |
| `duplicate-keys` | Varias filas para una zona, como muchos años en una columna. |
| `raw-counts` | Recuentos brutos en un mapa coloreado. `--fix` divide por la población. |
| `projection-mercator` | Mercator en una región de más de 20 grados de latitud. |
| `projection-not-equal-area` | Un mapa coloreado de una región grande con una proyección que distorsiona el área. |
| `max-classes` | Más de 7 clases. |
| `class-breaks-coverage` | Cortes que dejan algunos valores sin color. |
| `empty-class` | Una clase de la leyenda que ninguna zona usa. |
| `skewed-classes` | Clases iguales o manuales con la mayor parte del mapa en una sola. |
| `palette-order` | Una paleta que no se aclara ni se oscurece de forma constante. |
| `cvd-separation` | Colores que se acercan demasiado al simular daltonismo. |
| `diverging-center` | Una paleta divergente sin punto medio. |
| `too-many-categories` | Más de 8 categorías. |
| `normalize-missing` | Zonas sin población ni superficie por las que dividir. |
| `values-skipped` | Filas omitidas porque una celda no es un número o falta el denominador o es cero. |
| `no-data-share` | Un mapa que es en su mayor parte gris. |
| `label-overlap` | Etiquetas impresas unas sobre otras. |

Las condiciones exactas y los umbrales están en [docs/rules.md](docs/rules.md).

## Instalación

<details open>
<summary><b>Codex y el agente usado arriba</b> (los dos que probé)</summary>

```
npx skills add Arthur031221/Graticule
```

En un proyecto, el comando escribe `.agents/skills/graticule`, que lee Codex, y enlaza la carpeta de habilidades de los demás agentes que elijas. Después pide un mapa con palabras normales.

</details>

<details>
<summary><b>Cursor, Gemini CLI, OpenCode y otros agentes</b></summary>

Ejecuta el mismo comando y elige tu agente cuando lo pregunte el programa `skills`. No he ejecutado yo mismo estos agentes. Si tu agente tiene una carpeta de habilidades, copia `skills/graticule` en ella. Ocupa unos 14 MB y no hace falta nada más.

</details>

<details>
<summary><b>Aplicaciones de chat que aceptan subir una habilidad</b></summary>

Tras clonar el repositorio, crea `graticule-skill.zip` con `npm run package:skill` u obtenlo de una versión publicada. Súbelo donde la aplicación acepte una habilidad personalizada. La habilidad ejecuta un programa, así que la ejecución de código debe estar activada.

</details>

<details>
<summary><b>Solo línea de comandos</b></summary>

```
npx -y github:Arthur031221/Graticule render map.json
```

O clona el repositorio y ejecuta `node skills/graticule/scripts/graticule.mjs --help`. Hace falta Node 20 o posterior y ninguna red.

</details>

<details>
<summary><b>En el navegador</b></summary>

Abre el [área de pruebas](https://arthur031221.github.io/Graticule/). Suelta un CSV, arregla lo que encuentre el verificador y descarga SVG, PNG, PDF o una página HTML interactiva. Todo se ejecuta en la página y no se sube nada. La interfaz está en nueve idiomas. Suelta un archivo GeoJSON o TopoJSON junto a la tabla para dibujar tus propios límites.

</details>

## Uso

<p align="center"><img src="assets/cli.gif" alt="graticule join, check y render --fix sobre una tabla de muertes por COVID" width="860"></p>

```
graticule join deaths.csv --region world     # qué filas coinciden con qué zonas, antes de dibujar nada
graticule check map.json                     # cada hallazgo, con su razón
graticule render map.json --fix -f svg,png   # la reparación mínima para cada error y luego los archivos
```

Una especificación es un pequeño archivo JSON:

```json
{
  "title": "COVID-19 deaths per 100,000 people",
  "source": "WHO COVID-19 dashboard, up to 2026-09-20",
  "region": "world",
  "data": { "file": "deaths.csv", "key": "country", "value": "deaths", "kind": "count" }
}
```

`render` escribe `map.svg`, `map.png`, opcionalmente `map.pdf` y `map.html`, y `map.check.json`. El informe lista lo que coincidió, los límites de las clases y cada hallazgo. Consulta [docs/usage.md](docs/usage.md) para el recorrido completo y [docs/config.md](docs/config.md) para la lista de campos.

## Mapas y regiones

Cinco tipos de mapa: áreas coloreadas (coroplético), círculos proporcionales, categorías, mapas de localización con un pequeño globo y pequeños múltiplos que comparten una leyenda. Trece regiones: el mundo, seis continentes, estados y condados de Estados Unidos (Alaska, Hawái y Puerto Rico como recuadros), condados y municipios de Taiwán, prefecturas de Japón y provincias de Corea del Sur. Todo va incluido, así que dibujar funciona sin conexión. Para cualquier otro lugar, da un archivo GeoJSON o TopoJSON: `graticule init table.csv --boundaries states.geojson`. Cada propiedad que difiere entre elementos se convierte en una clave, y la proyección es una de áreas iguales elegida según la extensión. Ver [docs/config.md](docs/config.md).

| | | |
| --- | --- | --- |
| [<img src="docs/gallery/us-county-unemployment.png" alt="Desempleo por condado en Estados Unidos">](docs/gallery.md) | [<img src="docs/gallery/population-symbols.png" alt="Población como círculos proporcionales">](docs/gallery.md) | [<img src="docs/gallery/fertility-small-multiples.png" alt="Tasas de fecundidad en cuatro pequeños múltiplos">](docs/gallery.md) |
| [<img src="docs/gallery/taiwan-township-area.png" alt="Municipios de Taiwán en chino tradicional">](docs/gallery.md) | [<img src="docs/gallery/japan-regions.png" alt="Prefecturas de Japón por región">](docs/gallery.md) | [<img src="docs/gallery/brazil-state-density.png" alt="Densidad de población de Brasil, dibujada desde un archivo TopoJSON">](docs/gallery.md) |

[docs/gallery.md](docs/gallery.md) tiene los 17, cada uno con el mensaje que lo pidió, su especificación, sus datos y su registro de comprobación.

## Etiquetas en nueve idiomas

<p align="center"><img src="assets/languages.png" alt="El mismo mapa de Europa con etiquetas en nueve idiomas" width="860"></p>

Inglés, chino tradicional y simplificado, japonés, coreano, español, francés, alemán y portugués de Brasil. `--lang es` cambia las etiquetas del mapa y el idioma de los mensajes. El área de pruebas, los mensajes y estos README están traducidos a cada idioma.

## Comprobado con sistemas reales

Cada comprobación se ejecuta desde un script de este repositorio. La integración continua repite la mayoría. Las cifras y los métodos están en [docs/verification.md](docs/verification.md).

| Qué | Comparado con | Resultado |
| --- | --- | --- |
| 12 proyecciones | PROJ 9.8.1, 3.000 puntos cada una | 11 coinciden hasta 0,00001 m, Robinson hasta 10,2 km tras ajustar una escala |
| Clases por cuantiles, iguales y Jenks | mapclassify 2.11.0, 45 casos | mismos límites y recuentos, antes de redondear los límites de la leyenda |
| CIELAB, CIEDE2000, simulación de daltonismo | colour-science 0.4.7, colorspacious | dentro de 0,02 y dentro de 2 de 255 |
| Uniones por nombre | 6 listas públicas de países | ninguna unión errónea en 1.301 nombres |
| Recuentos frente a tasas | 33 indicadores del Banco Mundial | 0 de 25 tasas señaladas, 8 de 8 recuentos detectados |
| SVG, PDF y PNG | fontTools, pypdf, Pillow | todos los glifos y fuentes incrustados, tamaños correctos |

Las sesiones con agentes son una muestra pequeña: dos mensajes, dos agentes, dos ejecuciones cada uno. Léelas como ejemplos. Los mensajes y un ejecutor están en [eval](eval).

## Límites

- Los límites territoriales proceden de Natural Earth (1:50m para los países), los archivos del censo de Estados Unidos de 2017 y los del Ministerio del Interior de Taiwán. Están dibujados para mapas y no sirven para topografía. La Guayana Francesa, Martinica, Guadalupe, Mayotte y Reunión forman parte de Francia. Gibraltar y Tokelau no tienen polígono.
- Los condados de Estados Unidos son los de 2017, así que las regiones de planificación de Connecticut y las áreas censales más nuevas de Alaska no se unen.
- Los municipios de Taiwán solo tienen nombres en inglés y en chino tradicional. No se dibujan las islas Ogasawara y Amami de Japón ni Wuqiu en Taiwán.
- El detector de recuentos es una heurística con un límite de 0,6. Declara `data.kind` y queda fuera de juego.
- Una celda como `1,234` se lee como 1234, salvo que otra celda de la columna muestre comas decimales. El resto de las reglas para números está en [docs/config.md](docs/config.md).
- Las fuentes cubren los caracteres comunes de cada idioma (por ejemplo, los 5.401 caracteres del nivel 1 de Big5 para el chino tradicional). Un carácter fuera de ese conjunto se informa como `glyphs-missing`. No se admiten escrituras que van de derecha a izquierda o necesitan composición.
- En el mapa de Estados Unidos, Alaska se dibuja al 35 % de la escala de los 48 estados contiguos. Las áreas son comparables dentro de cada pieza.
- Las etiquetas usan un colocador voraz. Los mapas densos dejan algunas fuera y el informe las cuenta.
- Tus propios límites se dibujan tal cual, sin simplificar, así que un archivo con millones de vértices tarda en dibujarse. Las coordenadas deben ser longitud y latitud. Hace falta una propiedad de población para que `--fix` divida los recuentos brutos.

## Más

[Instalación](docs/install.md), [uso](docs/usage.md), [configuración](docs/config.md), [regiones](docs/regions.md), [reglas](docs/rules.md), [datos y licencias](docs/data.md), [arquitectura](docs/architecture.md), [verificación](docs/verification.md), [cómo contribuir](CONTRIBUTING.md), [historial de cambios](CHANGELOG.md).

Natural Earth, la Oficina del Censo de Estados Unidos, el Ministerio del Interior de Taiwán, las fuentes Noto, ColorBrewer, d3, pdfkit, resvg y HarfBuzz lo hacen posible. Las licencias están en [NOTICE.md](NOTICE.md).

Licencia MIT, ver [LICENSE](LICENSE).

Assisted by Claude/Codex.
