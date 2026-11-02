# Sudoku Helper

A small web app that reads a screenshot of a [Good Sudoku](https://www.playgoodsudoku.com/) puzzle and walks you through the next logical move, one hint at a time.

**Live site:** https://carlified.github.io/sudoku-helper/

This is a personal project I made for my girlfriend. It isn't a product, it isn't for sale, and it isn't maintained. It's shared publicly only because that's the easiest way to get it onto a phone.

## What it does

1. Take a screenshot in Good Sudoku and load it into the helper.
2. The helper reads the board: given digits, placed digits, pencil marks, highlighted marks and crossed-out marks.
3. Tap **Hint** for a nudge, again to see which cells are involved, and once more for the full explanation. **Apply & next** moves on to the following step.

Hints start with the easiest technique that makes progress (singles, pairs, pointing, X-Wings and so on). Each one names the rows, columns, boxes and cells involved in matching colours, and links to [SudokuWiki.org](https://www.sudokuwiki.org/) for further reading. If you've crossed out a candidate that is actually the answer, the helper warns you.

## Installing on an iPhone

Open the live site in Safari, tap **Share → Add to Home Screen**, then open it once from the new icon while you're online. After that it works offline.

## Privacy

All processing happens on your device. Screenshots are never uploaded, and the app has no analytics, accounts or tracking. The site is hosted on GitHub Pages, so GitHub sees the usual request information (such as your IP address) when the page is loaded. See [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Disclaimers

- **Not affiliated with Good Sudoku.** This project has no connection to Good Sudoku or its developers, and is not endorsed or sponsored by them. "Good Sudoku" is used only to describe which app's screenshots this tool can read. All trademarks belong to their respective owners.
- **Not affiliated with SudokuWiki.org.** Technique links point there because it's a great free resource. I have no connection to it.
- **Made with AI.** Most of the code and text in this project was written with the help of Claude, an AI assistant made by Anthropic. I reviewed and tested it, but it may still contain mistakes.
- **Hints can be wrong.** Screenshot reading is tuned to Good Sudoku's layout and may misread unusual themes, devices or future app updates. Use **Compare screenshot** and **Fix a cell** to check and correct what it read.
- **Not maintained.** It may stop working if Good Sudoku changes how it looks. Issues and pull requests may not get a response.
- **Not for profit.** It's free, has no ads, and never will.
- **No warranty.** It's provided as is. See the license below.

## How it works (briefly)

- `vision.js` finds the grid by following the thick 3×3 box lines, then reads each cell by its own colours. That way it adapts to light mode, dark mode and in-game themes. Big digits are matched against built-in shape templates. A pencil mark's digit comes from its position in the cell's 3×3 layout. Crossed-out marks are recognised by their diagonal slash, and highlighted marks by their bold stroke.
- `solver.js` tries human solving techniques from easiest to hardest and explains the first one that applies. It also solves the full puzzle to sanity-check your pencil marks.
- `app.js` and `index.html` are the interface. `sw.js` and `manifest.webmanifest` make it installable and usable offline.

There are no dependencies and no build step. It's plain HTML, CSS and JavaScript.

## License

[MIT](LICENSE) © 2026 Carl van Rooyen
