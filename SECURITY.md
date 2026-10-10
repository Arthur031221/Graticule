# Security

## Reporting a problem

Please report a vulnerability through GitHub's private reporting: open the Security tab of this repository and choose "Report a vulnerability". Do not open a public issue for it. I answer within a few days.

## What is in scope

Graticule reads files named by a spec, and specs can come from other people or from an agent. These count as vulnerabilities:

- A spec that makes the command line read a file outside the spec's folder (the `--data-root` rule), by a path, a symbolic link or any other route.
- A table, a boundary file or a spec that runs code, writes outside the output folder or crashes the program in a way that skips the rules.
- The playground sending any data off the page. It makes no request outside its own origin, and a test checks that.

A map that is wrong, a rule that fires too often or too rarely, and a name that joins to the wrong area are bugs, not vulnerabilities. Please open a normal issue for them.

## Supported versions

The latest release.
