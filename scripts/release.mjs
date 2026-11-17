#!/usr/bin/env node
// Publishes a new app version that installed apps pick up as an update.
//
//   npm run release -- 0.3.0              bump, build, tag, publish
//   npm run release -- 0.3.0 --dry-run    bump + build only, publish nothing
//
// Steps: set the version in tauri.conf.json / Cargo.toml / package.json,
// build a signed release APK (arm64 + armv7), commit "Release vX.Y.Z", tag,
// push, and create a GitHub release with the APK attached as
// CoasterCount.apk, the asset name the app's updater looks for
// (src-tauri/src/commands.rs → UPDATE_ASSET).
//
// Needs: a clean git tree, the GitHub CLI (`gh auth login`), and the release
// key configured in src-tauri/gen/android/keystore.properties.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const version = args.find((a) => /^\d+\.\d+\.\d+$/.test(a));
const dryRun = args.includes('--dry-run');
const ASSET = 'CoasterCount.apk';

if (!version) fail('Usage: npm run release -- <x.y.z> [--dry-run]');
const tag = `v${version}`;

const run = (cmd, cmdArgs) =>
  execFileSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
const out = (cmd, cmdArgs) => execFileSync(cmd, cmdArgs, { cwd: root, encoding: 'utf8' }).trim();

// ── preflight ──────────────────────────────────────────────────────────────
if (out('git', ['status', '--porcelain'])) fail('Working tree is not clean. Commit or stash first.');
if (out('git', ['tag', '--list', tag])) fail(`Tag ${tag} already exists.`);
if (!existsSync(join(root, 'src-tauri/gen/android/keystore.properties'))) {
  fail('Missing src-tauri/gen/android/keystore.properties: release builds must be signed (see README → Releasing).');
}
if (!dryRun) out('gh', ['auth', 'status']);

// Default Android tool locations on Windows, unless already set.
if (process.platform === 'win32') {
  const local = process.env.LOCALAPPDATA || join(os.homedir(), 'AppData/Local');
  process.env.JAVA_HOME ||= 'C:/Program Files/Android/Android Studio/jbr';
  process.env.ANDROID_HOME ||= join(local, 'Android/Sdk');
  if (!process.env.NDK_HOME) {
    const ndkDir = join(process.env.ANDROID_HOME, 'ndk');
    const versions = existsSync(ndkDir) ? readdirSync(ndkDir).sort() : [];
    if (versions.length) process.env.NDK_HOME = join(ndkDir, versions[versions.length - 1]);
  }
}

// ── bump version ───────────────────────────────────────────────────────────
const bump = (file, re, replacement) => {
  const path = join(root, file);
  const text = readFileSync(path, 'utf8');
  if (!re.test(text)) fail(`Couldn't find the version in ${file}`);
  writeFileSync(path, text.replace(re, replacement));
};
bump('src-tauri/tauri.conf.json', /"version":\s*"[^"]+"/, `"version": "${version}"`);
bump('package.json', /"version":\s*"[^"]+"/, `"version": "${version}"`);
bump('src-tauri/Cargo.toml', /^version = "[^"]+"/m, `version = "${version}"`);

// ── build ──────────────────────────────────────────────────────────────────
run('npx', ['tauri', 'android', 'build', '--apk', '--target', 'aarch64', '--target', 'armv7', '--ci']);
const built = join(root, 'src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk');
if (!existsSync(built)) fail(`Build finished but ${built} is missing.`);
mkdirSync(join(root, 'release'), { recursive: true });
const apk = join(root, 'release', ASSET);
copyFileSync(built, apk);
console.log(`\n✔ Built ${apk}`);

if (dryRun) {
  console.log('Dry run: version bumped and APK built; nothing committed or published.');
  process.exit(0);
}

// ── publish ────────────────────────────────────────────────────────────────
run('git', ['add', 'src-tauri/tauri.conf.json', 'package.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock']);
if (out('git', ['diff', '--cached', '--name-only'])) run('git', ['commit', '-m', `Release ${tag}`]);
run('git', ['tag', '-a', tag, '-m', `Coaster-Count ${version}`]);
run('git', ['push', 'origin', 'HEAD', tag]);
run('gh', ['release', 'create', tag, `${apk}#${ASSET}`, '--title', `Coaster-Count ${version}`, '--generate-notes']);
console.log(`\n✔ Released ${tag}. Installed apps will offer the update on their next launch check.`);

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}
