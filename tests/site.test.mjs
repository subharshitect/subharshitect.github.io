import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pickQuestion, nextQuestion } from "../assets/js/questions.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("question selection: URL beats session, session beats random", () => {
  const ids = ["a", "b", "c"];
  assert.equal(pickQuestion(ids, { requested: "c", stored: "b" }), "c");
  assert.equal(pickQuestion(ids, { requested: "zzz", stored: "b" }), "b");
  assert.equal(pickQuestion(ids, { stored: "gone", rand: () => 0.99 }), "c");
  assert.equal(pickQuestion([], {}), null);
  for (let i = 0; i < 20; i += 1) assert.notEqual(nextQuestion(ids, "a"), "a");
  assert.equal(nextQuestion(["a"], "a"), "a");
});

test("generated HTML is in sync with data/", () => {
  execFileSync("python3", [join(ROOT, "tools/build.py"), "--check"], { stdio: "pipe" });
});

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name.startsWith(".") || name === "node_modules") return [];
    if (statSync(p).isDirectory()) return htmlFiles(p);
    return name.endsWith(".html") ? [p] : [];
  });
}

test("every local link and asset points at a file that exists", () => {
  const missing = [];
  for (const file of htmlFiles(ROOT)) {
    const html = readFileSync(file, "utf8");
    for (const m of html.matchAll(/(?:href|src|data-src)="(\/[^"#?]*)/g)) {
      let target = join(ROOT, m[1]);
      if (m[1].endsWith("/")) target = join(target, "index.html");
      if (!existsSync(target)) missing.push(`${file.slice(ROOT.length)} → ${m[1]}`);
    }
  }
  // cv.pdf is a known placeholder behind data-draft until the file is added.
  assert.deepEqual(missing.filter((m) => !m.endsWith("/cv.pdf")), []);
});

test("the tagline is kept exactly", () => {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  assert.ok(html.includes(">researcher | ml systems | psychonaut of silicon<"));
});

test("decorative ASCII is not announced continuously", () => {
  for (const file of htmlFiles(ROOT)) {
    const html = readFileSync(file, "utf8");
    for (const m of html.matchAll(/<pre[^>]*>/g)) {
      assert.ok(!/aria-live/.test(m[0]), `${file.slice(ROOT.length)}: ${m[0]}`);
    }
  }
});
