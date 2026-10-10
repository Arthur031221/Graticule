<p align="center"><img src="assets/logo.svg" width="64" alt="Graticule 标志"></p>

# Graticule

给编程智能体用的制图技能：1 个技能、5 种地图、13 个区域或你自己的 GeoJSON、25 条规则、9 种语言。它不会画出有问题的地图，并且告诉你原因。

> **快速开始。** 运行 `npx skills add Arthur031221/Graticule`，然后对你的智能体说："用 deaths.csv 画各国的新冠死亡数地图"。

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

[![CI](https://github.com/Arthur031221/Graticule/actions/workflows/ci.yml/badge.svg)](https://github.com/Arthur031221/Graticule/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-c8412b?style=flat-square)](LICENSE) [![Live demo](https://img.shields.io/badge/live%20demo-open-c8412b?style=flat-square)](https://arthur031221.github.io/Graticule/)

<p align="center"><a href="https://arthur031221.github.io/Graticule/"><img src="assets/demo.gif" alt="一张有四个错误的地图被拦下，点一下就修好，接着标签换成另一种语言" width="860"></a></p>

**235 个** ISO 3166 国名中，有 **232 个**只靠名称就对到了正确的多边形，没有任何一个对错。用 Natural Earth 的英文名称做精确匹配，只能对到 202 个。
<sub>名称来自 datasets/country-codes（official_name_en），对 Natural Earth 1:50m 做匹配，并用每个名称的 ISO 代码检查有没有对错。另外五份公开名单的结果一致，见 [docs/verification.md](docs/verification.md)。</sub>

| 没有技能的编程智能体 | 同一个智能体加上 Graticule |
| --- | --- |
| <img src="assets/before.png" alt="用六个对数分级显示新冠死亡数原始计数的世界地图"> | <img src="assets/after.png" alt="每 10 万人新冠死亡数的世界地图，带图例、数据来源和小国的圆点"> |
| 直接把死亡数原始计数涂上颜色。图例是计数的对数分级，所以人口大国颜色最深。没有数据来源。 | 除以人口，使用等积投影，带数据来源，并逐个列出 14 条没有匹配上的数据行。用时 22 秒。 |

提示相同、文件相同，都是同一个智能体（Sonnet 5.5）的全新会话。没有技能的四个会话全都直接涂了原始计数：两个是那个智能体，两个是 Codex。完整记录在 [eval/runs](eval/runs)。

我写的是智能体赶工画地图时会跳过的那些规则，再加上一个规则没通过就不会运行的绘图器。不是又一个地图库。

## 为什么叫这个名字

Graticule 是地图上的经纬网。读者靠它确认地图画的位置对不对。这个项目对智能体画的地图做同样的事。同样的错误一再出现。

- **用计数而不是比率。** 把各国的死亡数涂上颜色，显示的只是人在哪里。Graticule 会要求你说明数值的种类，或发现数值的排序和人口一样，然后做除法。
- **世界地图用墨卡托。** 格陵兰看起来和非洲一样大。默认用等积投影，纬度跨度超过 20 度时拒绝墨卡托。
- **消失的数据行。** "Korea, Rep."对不上"South Korea"，却没人通知你。每一条对不上的数据行都会连同最接近的名称列出来，一个名称符合两个地方时绝不乱猜。
- **不是 UTF-8 的文件。** Windows 上的电子表格常把表格存成 Big5、Shift_JIS 或 Windows-1252，用 UTF-8 读取就一行也对不上。文件不是 UTF-8 时 Graticule 会说明，改按 Windows-1252 读取，并接受 `--encoding big5` 或 `data.encoding` 指定编码。
- **彩虹色板。** 明暗忽高忽低，会画出数据里根本没有的界线。色板必须逐步变亮或变暗，颜色还要让三种色觉异常的人都分得开，这部分由我的模拟负责检查。
- **变成空白方框的标签。** 中文、日文和韩文标签需要字体。每个输出文件都带有 Noto Sans CJK 的子集，只包含用到的字形。
- **没有来源。** 没有数据来源的地图会被拒绝。

## 它检查什么

25 条规则，每一条都有简明的理由，显示在检查结果旁边。错误会拦下地图。`--fix` 会修复只有单一机械式修法的错误，`--allow <id>` 会接受某条规则并在报告里留下备注。

| 规则 | 抓到什么 |
| --- | --- |
| `source-required` | 没有数据来源的地图。 |
| `title-required` | 没有标题的地图。 |
| `legend-title` | 没有说明数字是什么的图例。 |
| `kind-undeclared` | 数值可能是计数的分级着色图。 |
| `table-ragged` | 单元格数量不对的数据行。 |
| `join-blank` | 地区名称为空的数据行。 |
| `join-failed` | 大多数都对不到地区的键列。 |
| `join-unmatched` | 什么都匹配不到的数据行，连同最接近的名称一起列出。 |
| `join-ambiguous` | 符合不止一个地区的名称。 |
| `duplicate-keys` | 同一个地区有好几行，例如多个年份挤在一列。 |
| `raw-counts` | 分级着色图上的原始计数。`--fix` 会除以人口。 |
| `projection-mercator` | 在纬度跨度超过 20 度的区域用墨卡托。 |
| `projection-not-equal-area` | 大区域的分级着色图用了会扭曲面积的投影。 |
| `max-classes` | 超过 7 个分级。 |
| `class-breaks-coverage` | 让部分数值没有颜色的切分点。 |
| `empty-class` | 没有任何地区使用的图例分级。 |
| `skewed-classes` | 等距或手动分级让大半张地图落在同一级。 |
| `palette-order` | 不是逐步变亮或变暗的色板。 |
| `cvd-separation` | 在模拟色觉异常下太接近的颜色。 |
| `diverging-center` | 没有中点的发散色板。 |
| `too-many-categories` | 超过 8 个类别。 |
| `normalize-missing` | 没有人口或面积可除的地区。 |
| `values-skipped` | 因为单元格不是数字，或分母缺失、为零而被跳过的行。 |
| `no-data-share` | 大半是灰色的地图。 |
| `label-overlap` | 互相压在一起的标签。 |

确切的条件和阈值见 [docs/rules.md](docs/rules.md)。

## 安装

<details open>
<summary><b>Codex 与上面用的那个智能体</b>（我测试过的两个）</summary>

```
npx skills add Arthur031221/Graticule
```

在项目里，这个命令会写入 `.agents/skills/graticule`（Codex 读取），并链接你选的其他智能体的技能文件夹。接着用平常的话请它画地图就行。

</details>

<details>
<summary><b>Cursor、Gemini CLI、OpenCode 与其他智能体</b></summary>

运行同一个命令，在 `skills` 程序询问时选你的智能体。我没有自己跑过这些智能体。如果你的智能体有技能文件夹，把 `skills/graticule` 复制进去即可，大小约 14 MB，不需要其他东西。

</details>

<details>
<summary><b>支持上传技能的聊天应用</b></summary>

克隆项目后用 `npm run package:skill` 生成 `graticule-skill.zip`，或从发布版下载，再上传到应用接受自定义技能的地方。这个技能会运行程序，所以必须开启代码执行功能。

</details>

<details>
<summary><b>只用命令行</b></summary>

```
npx -y github:Arthur031221/Graticule render map.json
```

或克隆项目后运行 `node skills/graticule/scripts/graticule.mjs --help`。需要 Node 20 以上，不需要网络。

</details>

<details>
<summary><b>在浏览器里</b></summary>

打开[在线试玩](https://arthur031221.github.io/Graticule/)。拖入 CSV，修正检查器找到的问题，然后下载 SVG、PNG、PDF 或交互式 HTML 页面。所有运算都在页面内完成，不会上传任何数据。界面有九种语言。 把 GeoJSON 或 TopoJSON 文件拖到数据表旁边，就能画你自己的边界。

</details>

## 使用

<p align="center"><img src="assets/cli.gif" alt="对一份新冠死亡数表格运行 graticule join、check 和 render --fix" width="860"></p>

```
graticule join deaths.csv --region world     # 还没画任何东西之前，先看哪些数据行对到哪些地区
graticule check map.json                     # 列出所有检查结果和理由
graticule render map.json --fix -f svg,png   # 对每个错误做最小的修复，然后输出文件
```

配置文件是一个小小的 JSON：

```json
{
  "title": "COVID-19 deaths per 100,000 people",
  "source": "WHO COVID-19 dashboard, up to 2026-09-20",
  "region": "world",
  "data": { "file": "deaths.csv", "key": "country", "value": "deaths", "kind": "count" }
}
```

`render` 会写出 `map.svg`、`map.png`，按需还有 `map.pdf` 和 `map.html`，以及 `map.check.json`。报告列出匹配到了什么、分级边界和所有检查结果。完整教程见 [docs/usage.md](docs/usage.md)，字段清单见 [docs/config.md](docs/config.md)。

## 地图与区域

五种地图：分级着色图、比例圆形、类别、带小地球的位置图，以及共用同一个图例的小多图。十三个区域：世界、六大洲、美国各州与各县（阿拉斯加、夏威夷和波多黎各以插图呈现）、台湾的县市与乡镇市区、日本的都道府县，以及韩国的道与广域市。全部内置，所以绘图不需要网络。 其他地方请提供 GeoJSON 或 TopoJSON 文件：`graticule init table.csv --boundaries states.geojson`。每个在各要素间都不同的属性都会成为可用来匹配的键，投影则按范围选择等积投影。见 [docs/config.md](docs/config.md)。

| | | |
| --- | --- | --- |
| [<img src="docs/gallery/us-county-unemployment.png" alt="美国各县失业率">](docs/gallery.md) | [<img src="docs/gallery/population-symbols.png" alt="用比例圆形呈现人口">](docs/gallery.md) | [<img src="docs/gallery/fertility-small-multiples.png" alt="四张小多图呈现的生育率">](docs/gallery.md) |
| [<img src="docs/gallery/taiwan-township-area.png" alt="繁体中文的台湾乡镇市区地图">](docs/gallery.md) | [<img src="docs/gallery/japan-regions.png" alt="按地方划分的日本都道府县">](docs/gallery.md) | [<img src="docs/gallery/brazil-state-density.png" alt="用 TopoJSON 文件画出的巴西人口密度">](docs/gallery.md) |

[docs/gallery.md](docs/gallery.md) 有全部 17 张，每张都附上提出需求的提示、配置文件、数据和检查记录。

## 九种语言的标签

<p align="center"><img src="assets/languages.png" alt="用九种语言标注的同一张欧洲地图" width="860"></p>

英文、繁体中文、简体中文、日文、韩文、西班牙文、法文、德文和巴西葡萄牙文。`--lang zh-CN` 会改变地图标签和消息的语言。在线试玩、消息和这些 README 都翻译成了各种语言。

## 用真实系统验证

每一项检查都由这个项目里的脚本运行，CI 会重复大部分检查。数字和方法在 [docs/verification.md](docs/verification.md)。

| 项目 | 对比对象 | 结果 |
| --- | --- | --- |
| 12 种投影 | PROJ 9.8.1，每种 3,000 个点 | 11 种误差在 0.00001 米内，Robinson 在拟合一个比例后误差 10.2 公里 |
| 分位数、等距和 Jenks 分级 | mapclassify 2.11.0，45 个用例 | 图例取整之前，边界和数量完全相同 |
| CIELAB、CIEDE2000、色觉模拟 | colour-science 0.4.7、colorspacious | 误差在 0.02 内，色觉模拟差在 255 分之 2 内 |
| 名称匹配 | 6 份公开国名清单 | 1,301 个名称没有任何对错 |
| 计数与比率 | 33 个世界银行指标 | 25 个比率没有被误判，8 个计数全部抓到 |
| SVG、PDF 和 PNG | fontTools、pypdf、Pillow | 所有字形和字体都已嵌入，尺寸正确 |

智能体会话只是小样本：两个提示、两个智能体、各跑两次，请当作示例来看。提示和运行脚本在 [eval](eval)。

## 已知限制

- 边界来自 Natural Earth（国家用 1:50m）、2017 年的美国人口普查文件和台湾内政部的文件。它们是为了画地图而简化的，不能用来测量。法属圭亚那、马提尼克、瓜德罗普、马约特和留尼汪是法国的一部分。直布罗陀和托克劳没有多边形。
- 美国各县用的是 2017 年的版本，所以康涅狄格州的规划区和阿拉斯加较新的人口普查区对不上。
- 台湾乡镇市区只有英文和繁体中文名称。日本的小笠原群岛与奄美群岛，以及台湾的乌丘都没有画出。
- 计数检测器是阈值 0.6 的经验规则。声明 `data.kind` 就能跳过它。
- 像 `1,234` 这样的单元格会读成 1234，除非同一列的其他单元格显示用的是小数逗号。其余数字规则见 [docs/config.md](docs/config.md)。
- 字体覆盖各语言的常用字（例如繁体中文用 Big5 第一级的 5,401 个字）。超出范围的字会报告 `glyphs-missing`。不支持从右到左或需要字形变化处理的文字。
- 美国地图里，阿拉斯加是以下 48 州 35% 的比例绘制的。面积只能在同一块之内比较。
- 标签使用贪心式排版。数据密集的地图会漏掉一些，报告会列出数量。
- 你自己的边界照原样绘制，不做简化，顶点上百万的文件会画得很慢。坐标必须是经纬度。要让 `--fix` 能把原始计数除以人口，文件需要有人口属性。

## 更多

[安装](docs/install.md)、[使用](docs/usage.md)、[配置](docs/config.md)、[区域](docs/regions.md)、[规则](docs/rules.md)、[数据与许可](docs/data.md)、[架构](docs/architecture.md)、[验证](docs/verification.md)、[贡献](CONTRIBUTING.md)、[更新日志](CHANGELOG.md)。

Natural Earth、美国人口普查局、台湾内政部、Noto 字体、ColorBrewer、d3、pdfkit、resvg 和 HarfBuzz 让这一切成为可能。许可见 [NOTICE.md](NOTICE.md)。

MIT 许可，见 [LICENSE](LICENSE)。

Assisted by Claude/Codex.
