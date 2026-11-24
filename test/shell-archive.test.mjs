import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "..");

describe("archive build", { timeout: 180_000 }, () => {
  it("builds when the tree has no .git directory", () => {
    const dest = mkdtempSync(path.join(tmpdir(), "rf-archive-"));
    cpSync(root, dest, {
      recursive: true,
      filter(source) {
        const relative = path.relative(root, source);
        if (!relative) return true;
        const top = relative.split(path.sep)[0];
        return top !== ".git" && top !== "node_modules" && top !== "dist";
      },
    });
    const installed = spawnSync("npm", ["ci"], { cwd: dest, encoding: "utf8" });
    assert.equal(installed.status, 0, installed.stderr);
    const built = spawnSync("npm", ["run", "build"], {
      cwd: dest,
      encoding: "utf8",
      env: { ...process.env, RF_SHELL_SHARED: "" },
    });
    assert.equal(built.status, 0, built.stderr);
    const manifest = JSON.parse(readFileSync(path.join(dest, "dist/shell/manifest.json"), "utf8"));
    assert.equal(Object.hasOwn(manifest, "commit"), false);
    assert.match(manifest.current.topbar.path, /^\/shell\/topbar\.[0-9a-f]{64}\.js$/);
    assert.equal(readFileSync(path.join(dest, "dist/en/index.html"), "utf8").includes(manifest.current.topbar.path), true);
    rmSync(dest, { recursive: true, force: true });
  });
});
