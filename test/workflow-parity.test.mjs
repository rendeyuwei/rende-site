import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

describe("test environment parity", () => {
  it("installs puppeteer-core with npm ci and the same system tools in verify and deploy", () => {
    const pkg = JSON.parse(read("package.json"));
    assert.equal(pkg.devDependencies["puppeteer-core"], "^23.11.1");
    assert.equal(pkg.scripts.test, "npm run build && node --test --test-concurrency=1 test/*.test.mjs");
    const tools = "bash scripts/install-test-tools.sh";
    const ci = read(".github/workflows/ci.yml");
    const deploy = read(".github/workflows/deploy.yml");
    const script = read("scripts/install-test-tools.sh");
    assert.equal(ci.includes(tools), true);
    assert.equal(deploy.includes(`setup_command: ${tools}`), true);
    assert.equal(ci.includes("npm test"), true);
    assert.equal(deploy.includes("test_command:"), false);
    assert.equal(deploy.includes("install_command:"), false);
    assert.equal(ci.includes("puppeteer-core@"), false);
    assert.equal(ci.includes("apt-get"), false);
    assert.equal(deploy.includes("apt-get"), false);
    assert.equal(script.includes("nginx"), true);
    assert.equal(script.includes("google-chrome-stable"), true);
    assert.equal(script.includes("npm install"), false);
  });
});
