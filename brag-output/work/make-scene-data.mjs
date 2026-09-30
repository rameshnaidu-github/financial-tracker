// Bundles the beat sheet and the measured figures into one script tag,
// so the scene page can read them over file:// where fetch() is blocked.
import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(readFileSync("brag-output/work/scene-data.json", "utf8"));
const story = JSON.parse(readFileSync("brag-output/story.json", "utf8"));

writeFileSync(
  "brag-output/work/scene-data.js",
  [
    "// Generated from scene-data.json and story.json. Do not edit by hand:",
    "// node brag-output/work/make-scene-data.mjs",
    `window.__SCENE_DATA = ${JSON.stringify(data, null, 2)};`,
    `window.__STORY = ${JSON.stringify(story, null, 2)};`,
    ""
  ].join("\n")
);

console.log(`wrote scene-data.js (${story.scenes.length} scenes, ${Object.keys(data.figures).length} figures)`);
