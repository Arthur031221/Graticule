# Install

Graticule is an agent skill and a command line program in one folder. It needs Node 20 or newer. It never uses the network when it draws. The unit tests run on Linux with Node 20, 22 and 24, and on Windows and macOS with Node 22, on every push.

## As a skill for a coding agent

```
npx skills add Arthur031221/Graticule
```

The command copies `skills/graticule` into the agent's skills folder. In a project it writes `.agents/skills/graticule` (read by Codex) and links the skills folder of every other agent you pick. The `skills` program lists the agents it supports.

Ask for a map in plain words ("map COVID deaths by country from deaths.csv") and the agent reads `SKILL.md`, runs the program and checks the picture.

## By hand

Copy the folder `skills/graticule` into the skills folder your agent documents, in a project or in your home folder. The folder is self-contained: the program, the boundaries, the fonts and the translations are inside it, about 14 MB.

## For chat apps that take a skill upload

Download `graticule-skill.zip` from the latest release (or run `npm run package:skill` after cloning) and upload it where the app accepts a custom skill. Code execution has to be on, because the skill runs a program.

## As a plain command

```
npx -y github:Arthur031221/Graticule render map.json
```

or, after cloning, `node skills/graticule/scripts/graticule.mjs render map.json`. `graticule --help` lists the commands.

## In the browser

Open https://arthur031221.github.io/Graticule/. Nothing is installed and nothing is uploaded.

## Check that it works

`graticule` below stands for the program. After `npx skills add` it is `node .agents/skills/graticule/scripts/graticule.mjs` (the folder your agent reads may have another name), and from a clone it is `node skills/graticule/scripts/graticule.mjs`. With npx, write `npx -y github:Arthur031221/Graticule` in its place.

```
graticule rules
graticule join table.csv --region world
```

`graticule rules` prints the rules with their reasons. Exit codes are 0 for done, 1 for a usage or file error and 2 when a rule blocked the map.
