// The extension's icon is drawn inline rather than loaded from
// chrome-extension://. These are the assertions that keep it that way, and
// that keep the drawing the FocusTube logo rather than something else.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import assert from "node:assert";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const SRC = path.join(ROOT, "content-common.js");

// Set by makeEnv; a call to chrome.runtime.getURL while this is on is a
// failure, not a fallback, because that is the call the badge exists to avoid.
let urlCallsBanned = false;

function makeEnv() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://www.instagram.com/",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const noop = () => {};
  const chrome = {
    runtime: {
      id: "testid",
      lastError: null,
      getURL: (p) => {
        if (urlCallsBanned) {
          throw new Error("chrome.runtime.getURL called: " + p);
        }
        return "chrome-extension://testid/" + p;
      },
      sendMessage: noop,
      onMessage: { addListener: noop },
    },
    storage: {
      local: {
        get: (keys, cb) => cb && cb({}),
        set: (obj, cb) => cb && cb(),
        remove: (keys, cb) => cb && cb(),
      },
      onChanged: { addListener: noop },
    },
  };
  const ctx = vm.createContext({
    window: w,
    document: w.document,
    location: w.location,
    navigator: w.navigator,
    MutationObserver: w.MutationObserver,
    IntersectionObserver: w.IntersectionObserver,
    CustomEvent: w.CustomEvent,
    Node: w.Node,
    Element: w.Element,
    HTMLElement: w.HTMLElement,
    getComputedStyle: w.getComputedStyle.bind(w),
    requestAnimationFrame: w.requestAnimationFrame.bind(w),
    cancelAnimationFrame: w.cancelAnimationFrame.bind(w),
    matchMedia: w.matchMedia ? w.matchMedia.bind(w) : () => ({ matches: false, addEventListener: noop }),
    setTimeout: w.setTimeout.bind(w),
    clearTimeout: w.clearTimeout.bind(w),
    setInterval: w.setInterval.bind(w),
    clearInterval: w.clearInterval.bind(w),
    sessionStorage: w.sessionStorage,
    localStorage: w.localStorage,
    console,
    chrome,
  });
  ctx.globalThis = ctx;

  // UI and Utils are top-level consts, so they do not reach globalThis on
  // their own. Asserted rather than assumed: if the file's shape changes this
  // fails here rather than silently testing nothing.
  const source = fs.readFileSync(SRC, "utf8");
  assert.ok(/\bconst UI = \{/.test(source), "UI is no longer a top-level const");
  vm.runInContext(
    source + "\n;globalThis.__ft = { UI, Utils, CONFIG, FocusState };",
    ctx,
  );
  return { w, doc: w.document, ...ctx.__ft };
}

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log("  PASS  " + name);
  } catch (e) {
    failures++;
    console.log("  FAIL  " + name + "\n        " + e.message);
  }
};

console.log("the blocking overlay");
for (const type of ["strict", "warn"]) {
  const { doc, UI, CONFIG } = makeEnv();
  CONFIG.extensionEnabled = true;
  urlCallsBanned = true;
  let threw = null;
  try {
    UI.create(type, "ig", () => {}, () => {});
  } catch (e) {
    threw = e;
  }
  urlCallsBanned = false;

  check(`${type}: UI.create() completes`, () => {
    assert.equal(threw && threw.message, undefined, String(threw && threw.stack));
  });
  const overlay = doc.querySelector(".focus-tube-warning");
  check(`${type}: the overlay is on the page`, () => assert.ok(overlay));
  check(`${type}: the card carries the badge`, () => {
    const badge = overlay.querySelector("svg.focus-tube-icon-img");
    assert.ok(badge, "no badge in the card");
    assert.equal(
      badge.parentElement.className,
      "focus-tube-card",
      "badge is not a child of the card",
    );
  });
  check(`${type}: nothing in the card is an <img>`, () =>
    assert.equal(overlay.querySelector("img"), null));
  check(`${type}: the header is the one for this mode`, () =>
    assert.equal(
      overlay.querySelector("h1").textContent,
      type === "strict" ? "Strict Mode Active" : "Distraction Blocked",
    ));
}

console.log("\nthe badge is the FocusTube logo");
{
  const { doc, Utils } = makeEnv();
  const badge = Utils.createBadge("x");
  const rings = [...badge.querySelectorAll("circle")];
  check("a gradient plate, not a flat fill", () => {
    const plate = badge.querySelector("rect");
    assert.ok(plate, "no plate");
    assert.match(plate.getAttribute("fill"), /^url\(#/);
    const stops = [...badge.querySelectorAll("stop")].map((s) =>
      s.getAttribute("stop-color"),
    );
    assert.deepEqual(stops, ["#09db6b", "#06cc85"]);
  });
  check("four concentric rings, as on icons/icon128.png", () => {
    assert.equal(rings.length, 4);
    assert.deepEqual(
      rings.map((r) => r.getAttribute("r")),
      ["6.35", "11.2", "17.8", "27.45"],
    );
    assert.ok(rings.every((r) => r.getAttribute("cx") === "64"));
    assert.ok(rings.every((r) => r.getAttribute("fill") === "none"));
  });
  check("no stray marks - nothing but the plate and the rings", () => {
    const drawn = [...badge.querySelectorAll("*")].filter(
      (el) => !["defs", "linearGradient", "stop"].includes(el.tagName),
    );
    assert.deepEqual(
      drawn.map((el) => el.tagName),
      ["rect", "circle", "circle", "circle", "circle"],
    );
  });
  check("the icon's own padding is kept, so sizes do not shift", () => {
    assert.equal(badge.getAttribute("viewBox"), "0 0 128 128");
    const plate = badge.querySelector("rect");
    assert.equal(plate.getAttribute("x"), "9");
    assert.equal(plate.getAttribute("width"), "110");
  });
  check("two badges do not share a gradient id", () => {
    const a = Utils.createBadge();
    const b = Utils.createBadge();
    const idOf = (el) => el.querySelector("linearGradient").getAttribute("id");
    assert.notEqual(idOf(a), idOf(b));
    assert.equal(a.querySelector("rect").getAttribute("fill"), `url(#${idOf(a)})`);
  });
  check("it is decorative, so screen readers skip it", () =>
    assert.equal(badge.getAttribute("aria-hidden"), "true"));
  check("the class asked for is the class it gets", () =>
    assert.equal(badge.getAttribute("class"), "x"));
}

console.log("\nno content script builds an extension URL");
{
  const files = ["content-common.js", "content-fb.js", "content-ig.js", "content-li.js"];
  for (const file of files) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    check(`${file} never calls chrome.runtime.getURL outside the helper`, () => {
      const calls = src.split("\n").filter((raw) => {
        const line = raw.trim();
        // Comments name it in passing; only real call sites count.
        if (line.startsWith("//") || line.startsWith("*")) return false;
        if (/getExtensionUrl: function|return chrome\.runtime\.getURL/.test(line)) {
          return false;
        }
        return /chrome\.runtime\.getURL|Utils\.getExtensionUrl\(/.test(line);
      });
      assert.deepEqual(calls, [], calls.join("\n"));
    });
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall green");
process.exit(failures ? 1 : 0);
