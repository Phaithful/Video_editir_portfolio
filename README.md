# Faithful Madu: portfolio

Video editor and motion graphics portfolio. Plain HTML, CSS and JavaScript. No build step.

## Structure

```
index.html            Page content (commented by section)
css/styles.css        All styling, organised in numbered sections
js/theme-init.js      Sets light/dark before first paint
js/main.js            All behaviour, one init function per feature
assets/images/        me.webp (hero portrait). Put thumbnails here too
assets/logos/         Software logos (SVG)
```

## Run it

Open `index.html` in a browser, or serve the folder with any static host (Vercel, Netlify, GitHub Pages).

## Common edits

| To change | Where |
|-----------|-------|
| Showreel link | `index.html`, `.reel` element, `data-src` |
| A project's video, title, category | `index.html`, the `.card` button: `data-src`, `data-title`, `data-c` |
| A project thumbnail | Add `<img src="assets/images/..." alt="">` inside the card's `.thumb`, and delete the gradient |
| Colours and fonts | `css/styles.css`, section 1 (Design tokens) |
| Default theme (light / dark / system) | `js/theme-init.js`, `DEFAULT_THEME` |
| Services text | `index.html`, matching `.sv-tab` and `.sv-panel` (same order) |
| Email and social links | `index.html`, Contact section |

Card classes: `card l` landscape (YouTube), `card p` portrait, `card p d` graphics (4:5).

## Hero orbit

The four software logos circle the head in the hero portrait. Their angle comes from the timeline playhead: dragging the playhead turns the orbit, and the auto-playing timeline keeps it turning. Tune the size, radius and tilt in `initOrbit()` in `js/main.js`, and the logo size in `.orb` in `css/styles.css`.

## Background sound

An airy, angelic ambience generated in the browser (Web Audio), so there are no audio files. It is meant to feel like sunrise on a hillside: a slow major-key pad (C major 9, G major 7, A minor 9, F major 7) with a soft choir-like "ah" on top, a long bright reverb, and tiny bell-like glints. It follows the orbit and the playhead. Each time a logo passes the front the pad floats to the next chord and swells. A soft glint, a note from a happy five-note scale, plays each time the playhead passes a second mark on the ruler, climbing as you scrub forwards and falling as you scrub back. The sound also drifts left and right with the orbit. Browsers only allow sound after the first click, tap or key press, so it starts then. The speaker button in the header mutes it and remembers the choice. The chords, glint notes, glide time and volume are at the top of `initSound()` in `js/main.js`.

## Work grid groups

Projects are grouped under three headings in `index.html`: Long-form (YouTube, landscape), Short-form (vertical reels, shorts and motion graphics) and Graphics. Copy a card and paste it under the right heading. Headings only show on the "All" filter.

## Sound and videos

The background sound pauses while a video or the showreel is open in the player, and fades back in when it closes (however it is closed). Graphics cards (class `d`) do not pause the sound. This is done with two events, `portfolio:video-open` and `portfolio:video-close`, sent from `initVideoModal` and heard by `initSound` in `js/main.js`.
