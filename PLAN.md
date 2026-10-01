# FORAGER — an open world seen through a honeybee's eyes

One self-contained WebGL2 file. No assets: every mesh, texture, sound and line of story is generated
by code. The target is a 64k-demoscene-sized packed file (`dist/index.html`, self-extracting via
`DecompressionStream`), served on 0.0.0.0:9050 by `run.sh`.

## Modes
- **FILM** (~3.5 min, directed cameras + subtitles): one forager's first foraging trip.
- **FLY** (open world): fly a worker over a 3 km meadow, read the dance, find the patch, fill the crop,
  avoid bee-eaters, return home along the path-integration vector and dance yourself.
- Both share the world and the engine. `V` toggles bee vision, `E` the compound-eye mosaic.

## Story — "Forager" (Apis mellifera, a single summer day)
1. **The comb, before dawn.** Hive interior: 5.4 mm worker cells, capped brood, larvae, nectar, capped honey.
   Day 21 of her life: after cleaning, nursing, building and guarding she becomes a forager (age polyethism).
2. **The dance.** A returning sister waggle-dances on the vertical comb. Angle of the run from vertical =
   angle of the patch from the sun's azimuth. Run duration encodes distance. In the dark it is read by
   touch and air vibration, so we show it as vibration rings.
3. **Orientation flight.** Out of the entrance into blinding light; she turns and loops facing home,
   learning the box, the oak, the skyline.
4. **The sky compass.** Switch to bee vision: UV / blue / green receptors (peaks 344 / 436 / 544 nm), red nearly
   black, sky UV-bright. The dorsal rim reads the polarisation pattern of the sky (E-vector perpendicular to
   the sun-plane, degree ~ sin²γ/(1+cos²γ)). Optic flow measures distance over the grass forest.
5. **The patch.** Rudbeckia whose yellow petals carry a UV bullseye, red poppies that are UV-violet to her,
   blue cornflowers, white clover. Landing, 6 mm proboscis, corbiculae filling with pollen.
   A white crab spider (Misumena) waits on a daisy, cryptic to her too.
6. **Bee-eater.** On the way home a European bee-eater (Merops apiaster) swoops; she drops into the grass.
7. **Home.** Landmarks, landing board, guards' antennae, and she dances the same angle back.
   Closing facts: ~3 weeks of foraging, ~800 km flown, ~1/12 teaspoon of honey in a lifetime.

## Engine
- Raw WebGL2, MRT: every surface outputs **human RGB** and **bee receptor bands (G,B,UV)** at once, so the
  vision switch is a live animated blend in post, not a re-render. Each material carries a UV reflectance.
- Terrain: shared JS/GLSL integer-hash noise (identical heights for physics and rendering), camera-centred
  warped grid (8 mm cells under the bee, 25 m at the horizon), pond with sky-reflecting water.
- Grass forest: 4 instanced camera-centred rings of procedural blades (~100k), wind field, translucency.
- Flowers: 5 procedural species, CPU-placed (gameplay truth), instanced; per-fragment nectar guides & veins.
- Bees: procedural body (fur shells, banded abdomen, compound eyes, legs, corbiculae), wing-beat blur fans,
  flight/stand pose blending, waggle animation. Bee-eater, crab spider, oak trees, hive box, comb.
- Lighting: sun + sky hemisphere, 2 shadow cascades (bee-scale and landscape), translucency, aerial fog.
- Post: 4x MSAA HDR, bloom chain, depth of field (macro), ACES, grain, vignette, letterbox, compound eye
  hex mosaic with acceptance-angle blur, polarisation overlay in the sky.
- Audio: WebAudio synth only — wing buzz (~230 Hz, Doppler NPCs), hive hum, wind, FM birdsong, ambient pad.

## Build / verify
- `src/*.js` modules -> esbuild bundle+minify, GLSL whitespace/comment stripping -> deflate-raw -> base64
  self-extracting `dist/index.html`. `dist/dev.html` is the unpacked readable build for debugging.
- Headless Chromium on the real GPU (ANGLE/Vulkan) screenshots each story beat + fly mode; zero page errors.
