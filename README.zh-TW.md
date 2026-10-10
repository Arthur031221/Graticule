<p align="center"><img src="assets/logo.svg" width="64" alt="Graticule 標誌"></p>

# Graticule

給程式代理人用的製圖技能：1 個技能、5 種地圖、13 個區域或你自己的 GeoJSON、25 條規則、9 種語言。它不會畫出有問題的地圖，並且告訴你原因。

> **快速開始。** 執行 `npx skills add Arthur031221/Graticule`，然後對你的代理人說：「用 deaths.csv 畫各國的新冠死亡數地圖」。

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

[![CI](https://github.com/Arthur031221/Graticule/actions/workflows/ci.yml/badge.svg)](https://github.com/Arthur031221/Graticule/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-c8412b?style=flat-square)](LICENSE) [![Live demo](https://img.shields.io/badge/live%20demo-open-c8412b?style=flat-square)](https://arthur031221.github.io/Graticule/) [![Release](https://img.shields.io/github/v/release/Arthur031221/Graticule?style=flat-square&color=c8412b)](https://github.com/Arthur031221/Graticule/releases)

<p align="center"><a href="https://arthur031221.github.io/Graticule/"><img src="assets/demo.gif" alt="一張有四個錯誤的地圖被擋下，按一下就修好，接著標籤換成另一種語言" width="860"></a></p>

**235 個** ISO 3166 國名中，有 **232 個**只靠名稱就對到正確的多邊形，沒有任何一個對錯。拿 Natural Earth 的英文名稱做完全比對，只能對到 202 個。
<sub>名稱來自 datasets/country-codes（official_name_en），對 Natural Earth 1:50m 做比對，並以每個名稱的 ISO 代碼檢查有沒有對錯。另外五份公開名單的結果相同，見 [docs/verification.md](docs/verification.md)。</sub>

| 沒有技能的程式代理人 | 同一個代理人加上 Graticule |
| --- | --- |
| <img src="assets/before.png" alt="以六個對數級距顯示新冠死亡數原始計數的世界地圖"> | <img src="assets/after.png" alt="每 10 萬人新冠死亡數的世界地圖，附圖例、資料來源和小國的圓點"> |
| 直接把死亡數原始計數塗上顏色。圖例是計數的對數級距，所以人口大國顏色最深。沒有資料來源。 | 除以人口，使用等積投影，附資料來源，並逐一列出 14 筆對不上的資料列。耗時 22 秒。 |

提示相同、檔案相同，都是同一個代理人（Sonnet 5.5）的全新工作階段。沒有技能的四個工作階段全都直接塗了原始計數：兩個是那個代理人，兩個是 Codex。完整紀錄在 [eval/runs](eval/runs)。

我寫的是代理人趕工畫地圖時會略過的那些規則，再加上一個規則沒通過就不會執行的繪圖器。不是又一個地圖函式庫。

## 為什麼叫這個名字

Graticule 是地圖上的經緯網。讀者靠它確認地圖畫的位置對不對。這個專案對代理人畫的地圖做同樣的事。同樣的錯誤一再出現。

- **用計數而不是比率。** 把各國的死亡數塗上顏色，顯示的只是人在哪裡。Graticule 會要求你說明數值的種類，或發現數值的排序和人口一樣，然後做除法。
- **世界地圖用麥卡托。** 格陵蘭看起來和非洲一樣大。預設用等積投影，緯度跨度超過 20 度時拒絕麥卡托。
- **消失的資料列。** 「Korea, Rep.」對不上「South Korea」，卻沒人通知你。每一筆對不上的資料列都會連同最接近的名稱列出來，一個名稱符合兩個地方時絕不亂猜。
- **不是 UTF-8 的檔案。** Windows 上的試算表常把表格存成 Big5、Shift_JIS 或 Windows-1252，用 UTF-8 讀取就一筆也對不上。檔案不是 UTF-8 時 Graticule 會說明，改以 Windows-1252 讀取，並接受 `--encoding big5` 或 `data.encoding` 指定編碼。
- **彩虹色盤。** 明暗忽高忽低，會畫出資料裡根本沒有的界線。色盤必須逐步變亮或變暗，顏色還要讓三種色覺異常的人都分得開，這部分由我的模擬負責檢查。
- **變成空白方框的標籤。** 中文、日文和韓文標籤需要字型。每個輸出檔都帶有 Noto Sans CJK 的子集，只包含用到的字形。
- **沒有來源。** 沒有資料來源的地圖會被拒絕。

## 它檢查什麼

25 條規則，每一條都有簡明的理由，顯示在檢查結果旁邊。錯誤會擋下地圖。`--fix` 會修復只有單一機械式修法的錯誤，`--allow <id>` 會接受某條規則並在報告裡留下備註。

| 規則 | 抓到什麼 |
| --- | --- |
| `source-required` | 沒有資料來源的地圖。 |
| `title-required` | 沒有標題的地圖。 |
| `legend-title` | 沒有說明數字是什麼的圖例。 |
| `kind-undeclared` | 數值可能是計數的分級設色圖。 |
| `table-ragged` | 儲存格數量不對的資料列。 |
| `join-blank` | 地區名稱是空的資料列。 |
| `join-failed` | 大多數都對不到地區的鍵值欄。 |
| `join-unmatched` | 什麼都對不到的資料列，連同最接近的名稱一起列出。 |
| `join-ambiguous` | 符合不只一個地區的名稱。 |
| `duplicate-keys` | 同一個地區有好幾列，例如多個年份擠在一欄。 |
| `raw-counts` | 分級設色圖上的原始計數。`--fix` 會除以人口。 |
| `projection-mercator` | 在緯度跨度超過 20 度的區域用麥卡托。 |
| `projection-not-equal-area` | 大區域的分級設色圖用了會扭曲面積的投影。 |
| `max-classes` | 超過 7 個級距。 |
| `class-breaks-coverage` | 讓部分數值沒有顏色的切分點。 |
| `empty-class` | 沒有任何地區使用的圖例級距。 |
| `skewed-classes` | 等距或手動級距讓大半張地圖落在同一級。 |
| `palette-order` | 不是逐步變亮或變暗的色盤。 |
| `cvd-separation` | 在模擬色覺異常下太接近的顏色。 |
| `diverging-center` | 沒有中點的發散色盤。 |
| `too-many-categories` | 超過 8 個類別。 |
| `normalize-missing` | 沒有人口或面積可除的地區。 |
| `values-skipped` | 因為儲存格不是數字，或分母缺漏、為零而被略過的資料列。 |
| `no-data-share` | 大半是灰色的地圖。 |
| `label-overlap` | 互相壓在一起的標籤。 |

確切的條件和門檻見 [docs/rules.md](docs/rules.md)。

## 安裝

<details open>
<summary><b>Codex 與上面用的那個代理人</b>（我測試過的兩個）</summary>

```
npx skills add Arthur031221/Graticule
```

在專案裡，這個指令會寫入 `.agents/skills/graticule`（Codex 讀取），並連結你選的其他代理人的技能資料夾。接著用平常的話請它畫地圖就行。

</details>

<details>
<summary><b>Cursor、Gemini CLI、OpenCode 與其他代理人</b></summary>

執行同一個指令，在 `skills` 程式詢問時選你的代理人。我沒有自己跑過這些代理人。如果你的代理人有技能資料夾，把 `skills/graticule` 複製進去即可，大小約 14 MB，不需要其他東西。

</details>

<details>
<summary><b>支援上傳技能的聊天應用</b></summary>

複製專案後用 `npm run package:skill` 產生 `graticule-skill.zip`，或從發行版下載，再上傳到應用程式接受自訂技能的地方。這個技能會執行程式，所以必須開啟程式碼執行功能。

</details>

<details>
<summary><b>只用命令列</b></summary>

```
npx -y github:Arthur031221/Graticule render map.json
```

或複製專案後執行 `node skills/graticule/scripts/graticule.mjs --help`。需要 Node 20 以上，不需要網路。

</details>

<details>
<summary><b>在瀏覽器裡</b></summary>

開啟[線上試玩](https://arthur031221.github.io/Graticule/)。拖入 CSV，修正檢查器找到的問題，然後下載 SVG、PNG、PDF 或互動式 HTML 頁面。所有運算都在頁面內完成，不會上傳任何資料。介面有九種語言。 把 GeoJSON 或 TopoJSON 檔拖到資料表旁邊，就能畫你自己的邊界。

</details>

## 使用

<p align="center"><img src="assets/cli.gif" alt="對一份新冠死亡數表格執行 graticule join、check 和 render --fix" width="860"></p>

```
graticule join deaths.csv --region world     # 還沒畫任何東西之前，先看哪些資料列對到哪些地區
graticule check map.json                     # 列出所有檢查結果和理由
graticule render map.json --fix -f svg,png   # 對每個錯誤做最小的修復，然後輸出檔案
```

設定檔是一個小小的 JSON：

```json
{
  "title": "COVID-19 deaths per 100,000 people",
  "source": "WHO COVID-19 dashboard, up to 2026-09-20",
  "region": "world",
  "data": { "file": "deaths.csv", "key": "country", "value": "deaths", "kind": "count" }
}
```

`render` 會寫出 `map.svg`、`map.png`，視需要還有 `map.pdf` 和 `map.html`，以及 `map.check.json`。報告列出對到了什麼、級距邊界和所有檢查結果。完整教學見 [docs/usage.md](docs/usage.md)，欄位清單見 [docs/config.md](docs/config.md)。

## 地圖與區域

五種地圖：分級設色圖、比例圓形、類別、附小地球的位置圖，以及共用同一個圖例的小多圖。十三個區域：世界、六大洲、美國各州與各郡（阿拉斯加、夏威夷和波多黎各以插圖呈現）、臺灣的縣市與鄉鎮市區、日本的都道府縣，以及南韓的道與廣域市。全部內建，所以繪圖不需要網路。 其他地方請提供 GeoJSON 或 TopoJSON 檔：`graticule init table.csv --boundaries states.geojson`。每個在各圖徵間都不同的屬性都會成為可用來對應的鍵，投影則依範圍選擇等積投影。見 [docs/config.md](docs/config.md)。

| | | |
| --- | --- | --- |
| [<img src="docs/gallery/us-county-unemployment.png" alt="美國各郡失業率">](docs/gallery.md) | [<img src="docs/gallery/population-symbols.png" alt="以比例圓形呈現人口">](docs/gallery.md) | [<img src="docs/gallery/fertility-small-multiples.png" alt="四張小多圖呈現的生育率">](docs/gallery.md) |
| [<img src="docs/gallery/taiwan-township-area.png" alt="繁體中文的臺灣鄉鎮市區地圖">](docs/gallery.md) | [<img src="docs/gallery/japan-regions.png" alt="依地方劃分的日本都道府縣">](docs/gallery.md) | [<img src="docs/gallery/brazil-state-density.png" alt="用 TopoJSON 檔畫出的巴西人口密度">](docs/gallery.md) |

[docs/gallery.md](docs/gallery.md) 有全部 17 張，每張都附上提出需求的提示、設定檔、資料和檢查紀錄。

## 九種語言的標籤

<p align="center"><img src="assets/languages.png" alt="用九種語言標示的同一張歐洲地圖" width="860"></p>

英文、繁體中文、簡體中文、日文、韓文、西班牙文、法文、德文和巴西葡萄牙文。`--lang zh-TW` 會改變地圖標籤和訊息的語言。線上試玩、訊息和這些 README 都翻譯成各種語言。

## 用真實系統驗證

每一項檢查都由這個專案裡的腳本執行，CI 會重複大部分檢查。數字和方法在 [docs/verification.md](docs/verification.md)。

| 項目 | 比對對象 | 結果 |
| --- | --- | --- |
| 12 種投影 | PROJ 9.8.1，每種 3,000 個點 | 11 種誤差在 0.00001 公尺內，Robinson 在擬合一個比例後誤差 10.2 公里 |
| 分位數、等距和 Jenks 級距 | mapclassify 2.11.0，45 個案例 | 圖例取整之前，邊界和數量完全相同 |
| CIELAB、CIEDE2000、色覺模擬 | colour-science 0.4.7、colorspacious | 誤差在 0.02 內，色覺模擬差在 255 分之 2 內 |
| 名稱對應 | 6 份公開國名清單 | 1,301 個名稱沒有任何對錯 |
| 計數與比率 | 33 個世界銀行指標 | 25 個比率沒有被誤判，8 個計數全部抓到 |
| SVG、PDF 和 PNG | fontTools、pypdf、Pillow | 所有字形和字型都已嵌入，尺寸正確 |

代理人工作階段只是小樣本：兩個提示、兩個代理人、各跑兩次，請當作範例來看。提示和執行腳本在 [eval](eval)。

## 已知限制

- 邊界來自 Natural Earth（國家用 1:50m）、2017 年的美國人口普查檔案和臺灣內政部的檔案。它們是為了畫地圖而簡化的，不能拿來測量。法屬圭亞那、馬丁尼克、瓜德羅普、馬約特和留尼旺是法國的一部分。直布羅陀和托克勞沒有多邊形。
- 美國各郡用的是 2017 年的版本，所以康乃狄克州的規劃區和阿拉斯加較新的人口普查區對不上。
- 臺灣鄉鎮市區只有英文和繁體中文名稱。日本的小笠原群島與奄美群島，以及臺灣的烏坵都沒有畫出。
- 計數偵測器是門檻 0.6 的經驗法則。宣告 `data.kind` 就能跳過它。
- 像 `1,234` 這樣的儲存格會讀成 1234，除非同一欄的其他儲存格顯示用的是小數逗號。其餘數字規則見 [docs/config.md](docs/config.md)。
- 字型涵蓋各語言的常用字（例如繁體中文用 Big5 第一級的 5,401 個字）。超出範圍的字會回報 `glyphs-missing`。不支援從右到左或需要字形變化處理的文字。
- 美國地圖裡，阿拉斯加是以下 48 州 35% 的比例繪製。面積只能在同一塊之內比較。
- 標籤使用貪婪式排版。資料密集的地圖會漏掉一些，報告會列出數量。
- 你自己的邊界照原樣繪製。非常大的檔案會很慢，也很吃記憶體，請先簡化，例如用 mapshaper。座標必須是經緯度。要讓 `--fix` 能把原始計數除以人口，檔案需要有人口屬性。

## 更多

[安裝](docs/install.md)、[使用](docs/usage.md)、[設定](docs/config.md)、[區域](docs/regions.md)、[規則](docs/rules.md)、[資料與授權](docs/data.md)、[架構](docs/architecture.md)、[驗證](docs/verification.md)、[貢獻](CONTRIBUTING.md)、[更新紀錄](CHANGELOG.md)。

Natural Earth、美國人口普查局、臺灣內政部、Noto 字型、ColorBrewer、d3、pdfkit、resvg 和 HarfBuzz 讓這一切成為可能。授權見 [NOTICE.md](NOTICE.md)。

MIT 授權，見 [LICENSE](LICENSE)。

Assisted by Claude/Codex.
