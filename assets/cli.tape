# Records assets/cli.gif. Run from the repository root: vhs assets/cli.tape
Output assets/cli.gif
Require node

Set Shell "bash"
Set FontSize 15
Set Width 1180
Set Height 420
Set Padding 18
Set Theme "Catppuccin Latte"
Set TypingSpeed 28ms
Set WindowBar Colorful
Set WindowBarSize 36
Set BorderRadius 8

Hide
Type "cd .tmp/vhs && alias graticule='node ../../src/bin.js' && clear" Enter
Show

Type "graticule join deaths.csv --region world --key country | head -5" Enter
Sleep 2.2s
Type "clear" Enter
Type "graticule check covid.json | grep -E 'error|fix:'" Enter
Sleep 4s
Type "clear" Enter
Type "graticule render covid.json --fix -f png | grep -E 'fix-applied|wrote'" Enter
Sleep 4s
