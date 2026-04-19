import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const resourcesRoot = join(repoRoot, "dist-desktop-resources");
const backendRoot = join(resourcesRoot, "backend");
const buildRoot = join(resourcesRoot, ".build");
const cacheRoot = join(repoRoot, ".cache", "desktop-bridge");
const bridgeBinaryPath = join(backendRoot, "cuer-bridge");
const bridgeBundlePath = join(buildRoot, "bridge-bundle.cjs");
const seaConfigPath = join(buildRoot, "sea-config.json");
const seaBlobPath = join(buildRoot, "bridge.blob");
const packageLockPath = join(repoRoot, "package-lock.json");

await main();

async function main() {
  rmSync(resourcesRoot, { recursive: true, force: true });
  mkdirSync(backendRoot, { recursive: true });
  mkdirSync(buildRoot, { recursive: true });

  await buildBridgeBundle();
  copyRuntimeDependencies();
  writeSeaConfig();
  buildSeaBridge();
}

async function buildBridgeBundle() {
  await build({
    entryPoints: [join(repoRoot, "src", "desktop", "bridgeCli.ts")],
    outfile: bridgeBundlePath,
    bundle: true,
    format: "cjs",
    platform: "node",
    target: `node${process.versions.node}`,
    packages: "external",
    banner: {
      js: 'const { createRequire } = require("node:module"); require = createRequire(__filename);',
    },
  });
}

function copyRuntimeDependencies() {
  const lockfile = JSON.parse(readFileSync(packageLockPath, "utf8"));
  const packages = Object.entries(lockfile.packages ?? {})
    .filter(([relativePath, metadata]) => {
      if (!relativePath.startsWith("node_modules/")) {
        return false;
      }

      if (relativePath === "node_modules/@tauri-apps/api") {
        return false;
      }

      return metadata && metadata.dev !== true;
    })
    .map(([relativePath]) => relativePath)
    .sort((left, right) => left.localeCompare(right));

  for (const relativePath of packages) {
    cpSync(join(repoRoot, relativePath), join(backendRoot, relativePath), { recursive: true });
  }
}

function writeSeaConfig() {
  writeFileSync(
    seaConfigPath,
    `${JSON.stringify(
      {
        main: bridgeBundlePath,
        output: seaBlobPath,
        disableExperimentalSEAWarning: true,
      },
      null,
      2,
    )}\n`,
  );
}

function buildSeaBridge() {
  const seaNodePath = resolveSeaNodePath();

  run(seaNodePath, ["--experimental-sea-config", seaConfigPath], repoRoot);
  copyFileSync(seaNodePath, bridgeBinaryPath);
  chmodSync(bridgeBinaryPath, 0o755);

  if (process.platform === "darwin") {
    run("codesign", ["--remove-signature", bridgeBinaryPath], repoRoot);
  }

  const postjectCliPath = resolvePostjectCli();
  const postjectArgs = [
    postjectCliPath,
    bridgeBinaryPath,
    "NODE_SEA_BLOB",
    seaBlobPath,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ];

  if (process.platform === "darwin") {
    postjectArgs.push("--macho-segment-name", "NODE_SEA");
  }

  run(process.execPath, postjectArgs, repoRoot);

  if (process.platform === "darwin") {
    run("codesign", ["--sign", "-", bridgeBinaryPath], repoRoot);
  }

  chmodSync(bridgeBinaryPath, 0o755);
}

function resolveSeaNodePath() {
  if (binarySupportsSea(process.execPath)) {
    return process.execPath;
  }

  const download = resolveSeaNodeDownload();
  const archivePath = join(cacheRoot, download.archiveName);
  const extractRoot = join(cacheRoot, `${download.folderName}-root`);
  const extractedBinaryPath = join(extractRoot, download.folderName, "bin", "node");

  mkdirSync(cacheRoot, { recursive: true });

  if (!existsSync(extractedBinaryPath)) {
    rmSync(extractRoot, { recursive: true, force: true });
    mkdirSync(extractRoot, { recursive: true });
    downloadSeaNode(download.url, archivePath);
    extractSeaNodeArchive(archivePath, extractRoot);
  }

  if (!binarySupportsSea(extractedBinaryPath)) {
    throw new Error(`Downloaded Node binary at ${extractedBinaryPath} does not expose SEA support.`);
  }

  return extractedBinaryPath;
}

function binarySupportsSea(binaryPath) {
  if (!existsSync(binaryPath)) {
    return false;
  }

  const binary = readFileSync(binaryPath);
  return binary.includes(Buffer.from("NODE_SEA_FUSE_"));
}

function resolveSeaNodeDownload() {
  const seaNodeVersion = process.versions.node;
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin" && (arch === "arm64" || arch === "x64")) {
    const folderName = `node-v${seaNodeVersion}-darwin-${arch}`;
    return {
      archiveName: `${folderName}.tar.gz`,
      folderName,
      url: `https://nodejs.org/dist/v${seaNodeVersion}/${folderName}.tar.gz`,
    };
  }

  if (platform === "linux" && (arch === "arm64" || arch === "x64")) {
    const folderName = `node-v${seaNodeVersion}-linux-${arch}`;
    return {
      archiveName: `${folderName}.tar.xz`,
      folderName,
      url: `https://nodejs.org/dist/v${seaNodeVersion}/${folderName}.tar.xz`,
    };
  }

  throw new Error(`Unsupported platform for desktop bridge packaging: ${platform}/${arch}`);
}

function downloadSeaNode(url, archivePath) {
  if (existsSync(archivePath)) {
    return;
  }

  run("curl", ["-fsSL", "-o", archivePath, url], repoRoot);
}

function extractSeaNodeArchive(archivePath, extractRoot) {
  const compressionFlag = archivePath.endsWith(".tar.xz") ? "-xJf" : "-xzf";
  run("tar", [compressionFlag, archivePath, "-C", extractRoot], repoRoot);
}

function resolvePostjectCli() {
  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, "node_modules", "postject", "package.json"), "utf8"),
  );
  const bin = typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin.postject;

  if (!bin) {
    throw new Error("Unable to resolve the postject CLI entrypoint.");
  }

  return join(repoRoot, "node_modules", "postject", bin);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });

  if (result.status === 0) {
    return;
  }

  throw new Error(`Command failed: ${command} ${args.join(" ")}`);
}
