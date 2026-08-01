# Goody mobile portrait asset prompts

Final selected ImageGen prompts. Every prompt used `public/goody-cafe-backdrop-mobile.png` plus the matching desktop/generated asset as visual references.

## Ceiling and back wall

Create one opaque `1086x809` portrait structural layer containing only the beige patterned ceiling, deep-teal crown band, and central dark-red patterned back wall. Fill the canvas edge-to-edge in the existing warm Goody 8-bit pixel-art palette. No side walls, fixture, appliances, curtain, counter, props, text, or characters.

## Left side wall

Recompose the supplied isolated left wall on flat `#ff00ff`. The subject must be an uninterrupted `99x930` strip: teal crown trim, tall cream patterned wallpaper, teal dado, and lower wainscot panel. No props, floor, counter, text, shadow, or second wall. The right wall is mirrored at runtime.

## Floor

Create one opaque `1086x349` floor layer containing only warm beige square tiles in one-point portrait perspective. Fill edge-to-edge with crisp pixel clusters. No walls, counter, stools, cat, characters, objects, text, or baked movable shadows.

## Hanging fixture

Recompose the supplied fixture on flat `#ff00ff` to a subject bbox of `417x360`. Keep its full vertical span while extending the arms so the silhouette is wider than tall. Preserve round lamps and natural rod thickness. Match the reference landmarks: canopy at top center, left dark lamp, upper-right brass oval, glowing right lamp, lower-left brass node, and lower black lamp. No room, wall, text, shadow, or extra object.

## Refrigerator

Recompose the isolated red refrigerator on flat `#ff00ff` to a `215x364` subject bbox. Preserve the black upper vent, red control strip, paired doors, and two long black handles with natural proportions. No wall, floor, counter, notes, characters, shadow, or extra object.

## Oven

Generate one isolated `150x450` narrow double-deck dark graphite oven on flat `#ff00ff`, with two glowing orange windows, horizontal handles, and a slim right control column. No curtain, wall, floor, counter, text, character, shadow, or extra object.

## Teal curtain

Generate one isolated `300x452` teal curtain set on flat `#ff00ff`: two tied-back curtains and a top frame around an empty transparent center. No oven, wall, floor, counter, text, character, shadow, or extra prop.

## Counter base

Recompose the isolated counter base on flat `#ff00ff` to a `980x301` subject bbox. Keep the taller deep-teal body, lower trim, and curved red fluted right end at the final quarter. No countertop, display, pastries, stools, floor, text, shadow, or extra object.

## Counter top

Generate one isolated `948x83` cream stone countertop slab on flat `#ff00ff`, with visible thickness, thin dark lower edge, and rounded right overhang. No mixer, display, pastries, base, stools, floor, wall, text, shadow, or extra object.

## 390x844 perspective correction (v3)

These six assets were generated from the final `390x844` composition contract and normalized with nearest-neighbor sampling by `process-mobile-portrait-v3-assets.mjs`.

### Ceiling v2

Create one wide, shallow, opaque tan patterned ceiling with a deep-teal crown band along its bottom edge. Match the supplied Goody mobile reference. No wall, fixture, appliances, counter, props, text, or characters. Target `1170x252`.

### Back wall v2

Create one isolated tall central dark-red patterned back wall with a deep-teal cornice along its top edge on flat `#ff00ff`. No side walls, ceiling, floor, fixture, appliances, curtain, counter, props, text, or characters. Target `918x1467`.

### Angled side wall v3

Create one isolated extremely narrow, tall left side wall on flat `#ff00ff`. The outer edge is vertical; the inner edge slopes outward so the wall visibly widens toward the floor. Include tan wallpaper, teal crown trim, and teal lower wainscot extending over the floor boundary. No props, floor, counter, text, shadow, or second wall. Target `165x1770`; the right wall is mirrored at runtime.

### Floor v3

Create one opaque warm tan tiled floor in centered one-point perspective. Grout lines converge above the top edge; rows compress upward and tiles grow toward the bottom. No walls, counter, stools, cat, characters, objects, text, or baked shadows. Target `1170x843`.

### Counter top v2

Create one isolated cream stone countertop slab on flat `#ff00ff`, with a slightly narrower raised back edge, angled side edges, a wider rounded front edge, and visible fascia thickness. No base, mixer, display, pastries, stools, wall, floor, text, or characters. Target `1014x132`.

### Counter base v2

Create one isolated deep-teal perspective counter base on flat `#ff00ff`, with inset panels, visible side returns, subtly converging lower edges, brass bottom trim, and the curved red fluted right column. No countertop, mixer, display, pastries, stools, wall, floor, text, or characters. Target `978x486`.

## Runtime perspective and reference counter correction (v4)

The side-wall and floor sources remain flat canonical rectangles. Their visible perspective is defined only by the portrait `projective-quad` runtime profiles; the baked-perspective v3 wall/floor deliveries remain history and are inactive.

### Counter top v3

Recompose the supplied slab to match the mobile reference: one long, shallow cream stone top on flat `#ff00ff`, with a slightly narrower raised back edge, angled sides, wider gently rounded front edge, thin warm fascia, and narrow dark-teal shadow line. No base, contents, room, text, or characters. Normalize to `1014x132`.

### Counter base v3

Recompose the supplied base to match the mobile reference: one broad, mostly plain deep-teal apron on flat `#ff00ff`, with only a restrained horizontal upper band, simple lower trim, subtle perspective taper, and a large rounded red fluted right column with brass bottom trim. No decorative inset panels, doors, upward horns, countertop, contents, room, text, or characters. Normalize to `978x486`.
