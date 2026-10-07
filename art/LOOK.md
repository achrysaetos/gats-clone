# Map bake look log

Each iteration renders the same check tiles with `python3 art/look.py <dir>` and compares them with `docs/art/gold-standard.webp` at game zoom (1.07 screen px per game unit). The check tiles are Plaza 2,1 (concrete rooftop), 6,2 (two rooftops and a planter), 3,5 (long planter and stone blocks), Oldtown 1,2 (dense concrete barriers) and Causeway 4,4 (planter ring).

Render times on this machine are noisy, because other jobs share its 4 cores. Each time below says how loaded the machine was.

## Reference notes

- Shadows fall toward the lower left (south-west), not the lower right. Planters, the core platform and the broken wall all throw their shadow to their left and down. `ART.sun.shadow` was already south-west, and it stays there.
- Sunlit floor is about rgb(207, 197, 191). Floor in shadow is about rgb(124, 122, 126). Roof decks are about rgb(129, 128, 132).

## Iterations

1. **Baseline.** The old bake had a flat grey floor, cold light and dome-shaped fan caps. The domes came from smooth shading on the cylinder caps. Its tile was 37 KB as WebP.
2. **New materials and layout.** Floor slabs now get a per-slab tone, a photo grain texture (ambientCG Concrete044D), cracks (Asphalt011) behind a slow noise mask, oil spots, and AO-driven grime where walls meet the floor. Cover is precast, with an overhanging cap, chipped bevels, hazard ends and lifting pockets. Rooftops have a parapet, a sunken deck and a few composed units. Fan grilles are flat, with spokes. The quay now fills the whole margin. Result: the floor showed a fine grid, and the whole tile was washed out and cold. Tile 2,1 took 32.7 s and was 28 KB.
3. **Fixed the brick-texture scale.** The Brick node defaults to scale 5, which drew 20-unit seams instead of 100-unit slabs. Lowered the sky from 0.85 to 0.38 and raised the sun to 6, so lit and shadowed floor differ the way the reference does. Result: the light is warm and the shadows read. The roof deck was hidden under the building body.
4. **Opened the deck.** The building body now stops below the deck. The deck sits 6 units under the coping, so the parapet throws a shadow onto it. Raised the exposure and switched to AgX High Contrast. Shrubs are bigger, with bigger leaf cells. Result: the sampled tones match the reference (lit floor 205/199/192, shadow 117/116/111). The floor still looked too clean.
5. **Grit.** Added voronoi pits, stronger photo grain, 120-unit slabs and a darker seam. The roof deck now uses the slab shader in dark grey. Result: tiles are 42 to 45 KB. Times were 68 to 103 s because a second Blender bake and the test suite were running.
6. **Other maps.** Oldtown 1,2 and Causeway 4,4 render without errors. The barriers read as obstacles, but their tops were as bright as the floor. The rails were hairlines and the lifting eyes looked like stray dots. Under the same load as the old bake, Plaza 2,1 took 32.2 s against the old bake's 32.1 s (idle, the old bake took 28.9 s).
7. **Darker cover.** Darkened the cover albedo and made the rails thicker. The lifting eyes are now slots. An AO debug render showed that the grime term works, so it was simply too weak; it now starts closer to the wall and goes darker. Result: albedo 0.5 to 0.38 only moved the cap from 206 to 193. AgX squeezes the highlights, so cover and floor stay too close in tone.
8. **Tone mapping A/B.** Rendered one Oldtown crop under AgX High Contrast, AgX Punchy, Khronos PBR Neutral and Filmic High Contrast (`tools/variants.py` in the scratchpad). Khronos PBR Neutral keeps the highlights apart and the hazard yellow saturated, as in the reference. Switched to it, and moved the view transform into `ART.render.view`. Result: warmer and punchier, but the floor came out tan (187/176/163), and WebP grew to 53 to 70 KB.
9. **Rebalanced for Khronos.** Raised the exposure to 0.3, made the sun less orange (1, 0.9, 0.78), lowered the sky to 0.42, and turned down the floor grain and pits. Result: WebP is 45 to 61 KB. The stone blocks still read as flat tan squares.
10. **Stone coping.** Stone tops are now a grid of 50-unit coping stones in two tones, and the roof seams are softer. Result: Causeway 4,4 grew to 73 KB. Its planters cost about 2.6 times as many bytes per pixel as plain floor.
11. **WebP budget.** Made the floor pits sparser, the photo grain larger and the leaf cells larger. A 0.7 px blur cut the WebP size by 20% with no visible change at game zoom, because tiles are drawn at two thirds of their size. So the Cycles pixel filter went from 1.5 to 2.2 px. Result: Causeway 4,4 is 58 KB and Plaza 3,5 is 48 KB.
12. **Rooftops against the reference at equal scale.** Our roofs were large and empty. The reference roofs carry trims, frames and rails. Added a dark metal trim along the coping's inner edge, steel frames under the AC units, and a safety rail around the hatch. The floor paint is a duller ochre, because Khronos had pushed it to lemon. Roof slabs are 110 units.
13. **One big shape per roof.** Roofs over 60k square units get a stair and plant housing that rises 10 units above the parapet, with its own coping and vent. They also get 1 to 3 AC units, including a long three-fan unit. Result: the roofs read as composed, not as crowded or empty. Tiles are 40 to 48 KB.
14. **Collision check.** `art/blender/check_map.py` builds a map without rendering. It flags any point more than 1 unit above the floor that falls outside its wall rect, allowing for how far the shear moves a low point south. It found three faults: 2-unit downpipes on the floor south of buildings, roof foot bands 1 unit wider than the rect, and shrubs spilling past planter edges. All three are fixed, and every map now reports 0 uncovered points.
15. **Contract checks and final numbers.** Two separate bakes of Plaza 2,1 match pixel for pixel. Across the edge between Plaza 2,1 and 3,1, the mean step is 2.4 per channel, against 2.0 to 2.2 between neighbouring columns inside each tile, so the seam does not show. Plaza 9,9 is fully transparent past the margin (last opaque column 590, against 589 expected). In two interleaved runs under the same load (about 6), the old bake took 55 and 64 s per tile and the new one 31 and 28 s. The final check set, with the load at about 4, came out like this:

| Tile | Render | WebP q80 |
| --- | --- | --- |
| Plaza 2,1 | 30.3 s | 40 KB |
| Plaza 6,2 | 27.2 s | 42 KB |
| Plaza 3,5 | 27.3 s | 47 KB |
| Oldtown 1,2 | 28.6 s | 45 KB |
| Causeway 4,4 | 29.0 s | 56 KB |

## Still different from the reference

- The reference is busier everywhere: rubble, casings, scorch marks and broken walls. Those are live sprites and effects, not the bake. Without them our floor is calmer, which is intended.
- Reference cover has more modelled detail on every face: bolted plates, diamond-plate metal, stairs and catwalks. Ours has a few pieces per wall plus texture.
- Stone (sandstone) cover stays warmer and plainer than anything in the reference, which has no stone. We kept it distinct so the two materials still read apart.
- South faces are short (shear 0.3), so walls look lower than the reference's. Taller faces would hide floor behind them, and the shear is part of the contract.
