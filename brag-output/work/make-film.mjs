// Encodes the rendered frames and the soundtrack into brag.mp4, and bakes the poster
// in as frame 0 so every platform's thumbnail is the frame we chose.
// Usage: node brag-output/work/make-film.mjs [--poster <seconds>]
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ffmpeg = require("ffmpeg-static");
const args = process.argv.slice(2);
const posterAt = Number(args[args.indexOf("--poster") + 1] ?? 9.9);
const FPS = 30;
const FRAMES = "brag-output/work/frames";

const run = (...argv) => execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...argv], { stdio: "inherit" });

const count = readdirSync(FRAMES).filter((name) => name.endsWith(".png")).length;
if (count !== 660) throw new Error(`expected 660 frames, found ${count}`);

// The poster is a settled frame from the middle of the film, and also the first frame,
// so the thumbnail and the opening frame can never disagree.
const posterFrame = `${FRAMES}/f${String(Math.round(posterAt * FPS)).padStart(5, "0")}.png`;
if (!existsSync(posterFrame)) throw new Error(`no frame at ${posterAt}s`);
copyFileSync(posterFrame, "brag-output/work/poster-source.png");
copyFileSync(posterFrame, `${FRAMES}/f00000.png`);
run("-i", "brag-output/work/poster-source.png", "-q:v", "2", "brag-output/brag.jpg");

run(
  "-framerate", String(FPS),
  "-start_number", "0",
  "-i", `${FRAMES}/f%05d.png`,
  "-i", "brag-output/work/soundtrack.wav",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18",
  "-profile:v", "high", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  "-c:a", "aac", "-b:a", "192k",
  "-shortest",
  "brag-output/brag.mp4"
);

// The shipped intro is the same film at half the resolution, inside a 2 MB budget.
run(
  "-i", "brag-output/brag.mp4",
  "-vf", "scale=1280:720:flags=lanczos",
  "-c:v", "libx264", "-preset", "slow", "-crf", "30",
  "-profile:v", "main", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  "-c:a", "aac", "-b:a", "64k", "-ac", "1",
  "public/intro.mp4"
);

console.log(`poster from ${posterAt}s; wrote brag.mp4, brag.jpg and public/intro.mp4`);
