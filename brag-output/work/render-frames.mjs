// Renders a scene page to PNG frames through Chrome's debugging protocol.
// Usage: node render-frames.mjs [--scene work/scene2.html] [--stills t1,t2,...] [--fps 30] [--duration 22]
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9334;
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const stills = flag("stills", null);
const fps = Number(flag("fps", 30));
const duration = Number(flag("duration", 22));
const scene = flag("scene", "brag-output/work/scene2.html");
const OUT = stills ? "brag-output/work/stills" : "brag-output/work/frames";
if (!stills) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const child = execFile(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--window-size=1920,1080",
  "--force-device-scale-factor=1",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  "--allow-file-access-from-files",
  `--user-data-dir=/tmp/brag-render-${Date.now()}`,
  "about:blank"
]);
process.on("exit", () => child.kill());

async function target() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((item) => item.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // still starting
    }
    await delay(250);
  }
  throw new Error("Chrome never opened its debugging port");
}

const socket = new WebSocket(await target());
await new Promise((resolve2, reject) => {
  socket.addEventListener("open", resolve2, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let nextId = 1;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result ?? {});
    pending.delete(message.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve2) => {
    const id = nextId++;
    pending.set(id, resolve2);
    socket.send(JSON.stringify({ id, method, params }));
  });

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `file://${resolve(scene)}` });

// Wait until fonts and screenshots are in, so no frame renders half-dressed.
for (let attempt = 0; attempt < 80; attempt += 1) {
  const { result } = await send("Runtime.evaluate", { expression: "window.__ready === true", returnByValue: true });
  if (result?.value === true) break;
  await delay(250);
}

const times = stills
  ? stills.split(",").map(Number)
  : Array.from({ length: Math.round(duration * fps) }, (_, index) => index / fps);

let written = 0;
for (const [index, t] of times.entries()) {
  await send("Runtime.evaluate", { expression: `window.__render(${t});`, returnByValue: true });
  const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const name = stills ? `still-${t.toFixed(2)}.png` : `f${String(index).padStart(5, "0")}.png`;
  writeFileSync(`${OUT}/${name}`, Buffer.from(data, "base64"));
  written += 1;
  if (!stills && written % 60 === 0) console.log(`${written}/${times.length} frames`);
}
console.log(`wrote ${written} ${stills ? "stills" : "frames"} to ${OUT}`);
socket.close();
child.kill();
