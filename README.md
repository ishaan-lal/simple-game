# Tetris

A small browser Tetris. No build step, no dependencies — three static files.

## Play

Open `index.html` in a browser:

```sh
open index.html          # macOS
```

Or serve it locally if you prefer a real origin:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Controls

| Key | Action |
| --- | --- |
| `←` `→` | Move left / right (hold to repeat) |
| `↓` | Soft drop (+1 point per cell) |
| `Space` | Hard drop (+2 points per cell) |
| `↑` or `X` | Rotate clockwise |
| `Z` | Rotate counter-clockwise |
| `C` or `Shift` | Hold / swap piece (once per piece) |
| `P` | Pause |
| `R` | New game |

On phones and narrow screens, on-screen buttons appear below the board.

## Rules

- 10 x 20 well, standard seven tetrominoes, 7-bag randomizer (each piece appears
  once per bag, so no long droughts).
- Rotation nudges the piece sideways or up by up to two cells so it fits against
  walls, the floor, and the stack.
- Line score is 100 / 300 / 500 / 800 for 1 / 2 / 3 / 4 rows, multiplied by the
  current level.
- Level rises every 10 lines and gravity speeds up with it, from 800 ms per cell
  down to 50 ms.
- A translucent ghost shows where a hard drop will land.
- Best score is kept in `localStorage`.

## Files

- `index.html` — markup
- `style.css` — layout and theme
- `tetris.js` — game loop, board state, input, rendering
