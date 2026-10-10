<p align="center"><img src="assets/logo.svg" width="64" alt="Graticule のロゴ"></p>

# Graticule

コーディングエージェント向けの地図作成スキル: 1 つのスキル、5 種類の地図、13 の地域または独自の GeoJSON、25 のルール、9 つの言語。おかしな地図は描きませんし、その理由も伝えます。

> **クイックスタート。** `npx skills add Arthur031221/Graticule` を実行し、エージェントにこう頼んでください。「deaths.csv から国ごとの COVID 死者数の地図を作って」。

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

[![CI](https://github.com/Arthur031221/Graticule/actions/workflows/ci.yml/badge.svg)](https://github.com/Arthur031221/Graticule/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-c8412b?style=flat-square)](LICENSE) [![Live demo](https://img.shields.io/badge/live%20demo-open-c8412b?style=flat-square)](https://arthur031221.github.io/Graticule/) [![Release](https://img.shields.io/github/v/release/Arthur031221/Graticule?style=flat-square&color=c8412b)](https://github.com/Arthur031221/Graticule/releases)

<p align="center"><a href="https://arthur031221.github.io/Graticule/"><img src="assets/demo.gif" alt="4 つの誤りがある地図が止められ、ワンクリックで直り、ラベルの言語が切り替わる" width="860"></a></p>

ISO 3166 の国名 **235 件のうち 232 件**が、名前だけで正しいポリゴンに結びつきます。間違ったものは 1 件もありません。Natural Earth の英語名との完全一致では 202 件です。
<sub>名前は datasets/country-codes（official_name_en）から取り、Natural Earth 1:50m に結合しました。誤結合は各名前の ISO コードと照らして数えています。ほかの公開リスト 5 つでも同じ結果です。[docs/verification.md](docs/verification.md) を見てください。</sub>

| スキルなしのコーディングエージェント | 同じエージェントに Graticule を加えたもの |
| --- | --- |
| <img src="assets/before.png" alt="COVID 死者数の生の件数を 6 段階の対数区分で塗った世界地図"> | <img src="assets/after.png" alt="人口 10 万人あたりの COVID 死者数の世界地図。凡例、出典、小国を示す点つき"> |
| 死者数の生の件数をそのまま塗りました。凡例は件数の対数区分なので、人口の多い国が濃くなります。出典の行はありません。 | 人口で割り、正積図法を使い、出典の行を付け、一致しなかった 14 行を名前で挙げました。22 秒でした。 |

プロンプトも、ファイルも、エージェントも同じ（Sonnet 5.5）で、新しいセッションで試しました。スキルなしの 4 セッションは、そのエージェント 2 回と Codex 2 回のいずれも、生の件数を塗りました。記録は [eval/runs](eval/runs) にあります。

私が書いたのは、エージェントが急いで地図を描くときに飛ばしてしまうルールと、そのルールを通らなければ動かない描画器です。新しい地図ライブラリではありません。

## 名前の由来

graticule は、地図に引かれた緯線と経線の格子のことです。読者はこれで、地図がその位置にあるかどうかを確かめます。このプロジェクトは、エージェントが描く地図に同じことをします。間違いはいつも同じです。

- **割合ではなく件数。** 国ごとの死者数をそのまま塗ると、人がどこにいるかを示すだけです。Graticule は種類（kind）の宣言を求め、値が人口と同じ順に並んでいればそれに気づいて、割り算をします。
- **世界地図にメルカトル。** グリーンランドがアフリカと同じ大きさに見えます。標準は正積図法で、緯度の幅が 20 度を超える地域でのメルカトルは拒否します。
- **消える行。** 「Korea, Rep.」は「South Korea」と一致せず、誰にも知らされません。結合できなかった行はすべて、近い名前とともに一覧になります。2 つの場所に当てはまる名前を推測で決めることはありません。
- **UTF-8 ではないファイル。** Windows の表計算ソフトは表を Big5、Shift_JIS、Windows-1252 で保存することが多く、UTF-8 として読むと 1 行も一致しません。Graticule はファイルが UTF-8 でないことを伝え、Windows-1252 として読み、`--encoding big5` または `data.encoding` で文字コードを指定できます。
- **虹色のパレット。** 明るさが上下すると、データにない境界線が現れます。パレットは明るさが一方向に変わらなければならず、3 種類の色覚特性のシミュレーションでも色が離れている必要があります。
- **空の四角になるラベル。** 中国語、日本語、韓国語のラベルにはフォントが必要です。出力ごとに、使う字形だけを含む Noto Sans CJK のサブセットを埋め込みます。
- **出典なし。** 出典の行がない地図は拒否します。

## 何をチェックするか

25 のルールがあり、それぞれに分かりやすい理由が結果の横に表示されます。エラーは地図を止めます。`--fix` は機械的な直し方が 1 つに決まるものを直し、`--allow <id>` はルールを受け入れてレポートに記録を残します。

| ルール | 見つけるもの |
| --- | --- |
| `source-required` | 出典の行がない地図。 |
| `title-required` | タイトルがない地図。 |
| `legend-title` | 数値が何かを書いていない凡例。 |
| `kind-undeclared` | 値が件数かもしれない塗り分け地図。 |
| `table-ragged` | セルの数が合わない表の行。 |
| `join-blank` | 地域名が空の行。 |
| `join-failed` | ほとんどの行がどの地域にも一致しないキー列。 |
| `join-unmatched` | どこにも一致しない行。近い名前つきで一覧にします。 |
| `join-ambiguous` | 複数の地域に当てはまる名前。 |
| `duplicate-keys` | 1 つの地域に複数の行があるもの。たとえば複数の年が 1 列に入っている場合。 |
| `raw-counts` | 塗り分け地図の生の件数。`--fix` は人口で割ります。 |
| `projection-mercator` | 緯度の幅が 20 度を超える地域でのメルカトル。 |
| `projection-not-equal-area` | 大きな地域の塗り分け地図で、面積をゆがめる図法を使っているもの。 |
| `max-classes` | 7 階級を超えるもの。 |
| `class-breaks-coverage` | 色が付かない値を残す区切り。 |
| `empty-class` | どの地域も使わない凡例の階級。 |
| `skewed-classes` | 等間隔や手動の階級で、地図の大半が 1 つの階級に入るもの。 |
| `palette-order` | 明るさが一方向に変わらないパレット。 |
| `cvd-separation` | 色覚特性のシミュレーションで近づきすぎる色。 |
| `diverging-center` | 中心値のない発散型パレット。 |
| `too-many-categories` | 8 カテゴリを超えるもの。 |
| `normalize-missing` | 割る人口や面積がない地域。 |
| `values-skipped` | セルが数値でない、または分母が欠けているか 0 のために除外された行。 |
| `no-data-share` | ほとんどが灰色の地図。 |
| `label-overlap` | 重なって印刷されるラベル。 |

正確な条件としきい値は [docs/rules.md](docs/rules.md) にあります。

## インストール

<details open>
<summary><b>Codex と上で使ったエージェント</b>（私が試した 2 つ）</summary>

```
npx skills add Arthur031221/Graticule
```

プロジェクト内で、このコマンドは `.agents/skills/graticule`（Codex が読みます）を作り、選んだほかのエージェントのスキルフォルダにもリンクします。あとは普通の言葉で地図を頼むだけです。

</details>

<details>
<summary><b>Cursor、Gemini CLI、OpenCode、そのほかのエージェント</b></summary>

同じコマンドを実行し、`skills` プログラムが聞いてきたらエージェントを選びます。これらのエージェントは私自身は動かしていません。エージェントにスキルフォルダがあるなら、`skills/graticule` をそこにコピーしてください。約 14 MB で、ほかに必要なものはありません。

</details>

<details>
<summary><b>スキルのアップロードを受け付けるチャットアプリ</b></summary>

クローンしたあと `npm run package:skill` で `graticule-skill.zip` を作るか、リリースから取得します。アプリがカスタムスキルを受け付ける場所にアップロードしてください。このスキルはプログラムを実行するので、コード実行を有効にする必要があります。

</details>

<details>
<summary><b>コマンドラインだけ</b></summary>

```
npx -y github:Arthur031221/Graticule render map.json
```

または、クローンして `node skills/graticule/scripts/graticule.mjs --help` を実行します。Node 20 以上が必要で、ネットワークは要りません。

</details>

<details>
<summary><b>ブラウザーで</b></summary>

[プレイグラウンド](https://arthur031221.github.io/Graticule/)を開きます。CSV をドロップし、チェッカーが見つけた問題を直して、SVG、PNG、PDF、インタラクティブな HTML ページをダウンロードします。処理はすべてページの中で行われ、何もアップロードされません。画面は 9 つの言語に対応しています。 GeoJSON または TopoJSON ファイルを表の隣にドロップすると、独自の境界で描けます。

</details>

## 使い方

<p align="center"><img src="assets/cli.gif" alt="COVID 死者数の表に対する graticule join、check、render --fix" width="860"></p>

```
graticule join deaths.csv --region world     # 何かを描く前に、どの行がどの地域に一致するかを見る
graticule check map.json                     # すべての指摘を理由つきで表示する
graticule render map.json --fix -f svg,png   # エラーごとに最小限の修正をして、ファイルを書き出す
```

仕様は小さな JSON ファイルです。

```json
{
  "title": "COVID-19 deaths per 100,000 people",
  "source": "WHO COVID-19 dashboard, up to 2026-09-20",
  "region": "world",
  "data": { "file": "deaths.csv", "key": "country", "value": "deaths", "kind": "count" }
}
```

`render` は `map.svg`、`map.png`、必要に応じて `map.pdf` と `map.html`、そして `map.check.json` を書き出します。レポートには、一致したもの、階級の境界、すべての指摘が載っています。通しの手順は [docs/usage.md](docs/usage.md)、項目の一覧は [docs/config.md](docs/config.md) を見てください。

## 地図と地域

地図は 5 種類です。塗り分け（コロプレス）、比例円、カテゴリ、小さな地球儀つきの位置図、1 つの凡例を共有する小さな複数図です。地域は 13 です。世界、6 つの大陸、アメリカの州と郡（アラスカ、ハワイ、プエルトリコは挿入図）、台湾の県市と郷鎮市区、日本の都道府県、韓国の道と広域市です。すべて同梱しているので、描画はオフラインでできます。 それ以外の場所には GeoJSON または TopoJSON ファイルを渡します。`graticule init table.csv --boundaries states.geojson`。フィーチャごとに値が異なるプロパティはすべて照合用のキーになり、投影は範囲から選ばれる正積図法です。[docs/config.md](docs/config.md) を見てください。

| | | |
| --- | --- | --- |
| [<img src="docs/gallery/us-county-unemployment.png" alt="アメリカの郡別失業率">](docs/gallery.md) | [<img src="docs/gallery/population-symbols.png" alt="比例円で表した人口">](docs/gallery.md) | [<img src="docs/gallery/fertility-small-multiples.png" alt="4 枚の小さな複数図で見る出生率">](docs/gallery.md) |
| [<img src="docs/gallery/taiwan-township-area.png" alt="繁体字中国語の台湾の郷鎮市区">](docs/gallery.md) | [<img src="docs/gallery/japan-regions.png" alt="地方別の日本の都道府県">](docs/gallery.md) | [<img src="docs/gallery/brazil-state-density.png" alt="TopoJSON ファイルから描いたブラジルの人口密度">](docs/gallery.md) |

[docs/gallery.md](docs/gallery.md) に 17 枚すべてがあります。それぞれ、依頼したプロンプト、仕様、データ、チェックログつきです。

## 9 つの言語のラベル

<p align="center"><img src="assets/languages.png" alt="9 つの言語でラベルを付けた同じヨーロッパの地図" width="860"></p>

英語、繁体字・簡体字中国語、日本語、韓国語、スペイン語、フランス語、ドイツ語、ブラジルのポルトガル語です。`--lang ja` は地図のラベルとメッセージの言語を切り替えます。プレイグラウンド、メッセージ、この README は、それぞれの言語に翻訳されています。

## 実際のシステムとの照合

どのチェックもこのリポジトリのスクリプトから実行でき、CI がその多くを繰り返します。数値と方法は [docs/verification.md](docs/verification.md) にあります。

| 対象 | 比較先 | 結果 |
| --- | --- | --- |
| 12 の図法 | PROJ 9.8.1、各 3,000 点 | 11 は 0.00001 m 以内で一致、Robinson は 1 つの倍率を合わせたあとで 10.2 km |
| 分位数、等間隔、Jenks の階級 | mapclassify 2.11.0、45 ケース | 凡例用に丸める前の境界も件数も同じ |
| CIELAB、CIEDE2000、色覚シミュレーション | colour-science 0.4.7、colorspacious | 0.02 以内、255 のうち 2 以内 |
| 名前の結合 | 公開された国名リスト 6 つ | 1,301 件の名前に誤結合なし |
| 件数と割合 | 世界銀行の指標 33 件 | 割合 25 件は 0 件を誤検出、件数 8 件は 8 件とも検出 |
| SVG、PDF、PNG | fontTools、pypdf、Pillow | すべての字形とフォントを埋め込み、サイズも正しい |

エージェントのセッションは小さな標本です。プロンプトは 2 つ、エージェントは 2 つ、各 2 回です。例として読んでください。プロンプトと実行用スクリプトは [eval](eval) にあります。

## 制限

- 境界は Natural Earth（国は 1:50m）、2017 年のアメリカ国勢調査のファイル、台湾の内政部のファイルから来ています。地図を描くためのもので、測量には使えません。フランス領ギアナ、マルティニーク、グアドループ、マヨット、レユニオンはフランスの一部です。ジブラルタルとトケラウにはポリゴンがありません。
- アメリカの郡は 2017 年版なので、コネチカット州の計画地域や、アラスカの新しい国勢調査区域は結合できません。
- 台湾の郷鎮市区には英語と繁体字中国語の名前しかありません。日本の小笠原諸島と奄美群島、台湾の烏坵は描かれません。
- 件数の検出器は、しきい値 0.6 の経験則です。`data.kind` を宣言すれば無視できます。
- `1,234` のようなセルは 1234 と読みます。同じ列の別のセルが小数点にカンマを使っていれば、それに従います。そのほかの数値の規則は [docs/config.md](docs/config.md) にあります。
- フォントは各言語の一般的な文字をカバーします（たとえば繁体字中国語では Big5 第 1 水準の 5,401 字）。それ以外の文字は `glyphs-missing` として報告されます。右から左へ書く文字や、字形の組み立てが必要な文字には対応していません。
- アメリカの地図では、アラスカは本土 48 州の 35% の縮尺で描かれます。面積を比べられるのは、同じ区画の中だけです。
- ラベルは貪欲法で配置します。密な地図では省かれるものがあり、その数をレポートに記録します。
- 独自の境界はそのまま描画します。簡略化はしないため、頂点が数百万あるファイルは描画に時間がかかります。座標は経度と緯度でなければなりません。`--fix` が生の件数を人口で割るには、人口のプロパティが必要です。

## ほかには

[インストール](docs/install.md)、[使い方](docs/usage.md)、[設定](docs/config.md)、[地域](docs/regions.md)、[ルール](docs/rules.md)、[データとライセンス](docs/data.md)、[アーキテクチャ](docs/architecture.md)、[検証](docs/verification.md)、[コントリビュート](CONTRIBUTING.md)、[変更履歴](CHANGELOG.md)。

Natural Earth、アメリカ国勢調査局、台湾の内政部、Noto フォント、ColorBrewer、d3、pdfkit、resvg、HarfBuzz のおかげで成り立っています。ライセンスは [NOTICE.md](NOTICE.md) にあります。

MIT ライセンス。[LICENSE](LICENSE) を見てください。

Assisted by Claude/Codex.
