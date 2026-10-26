import fs from "fs";
import path from "path";
import JSZip from "jszip";

const rootDir = process.cwd();
const publicZipPath = path.join(rootDir, "public", "andromeda-ai.zip");
const zip = new JSZip();

const excludeList = new Set([
  "node_modules",
  ".git",
  ".output",
  ".wrangler",
  ".aistudio",
  ".playwright-cli",
  "dist",
  "andromeda-ai.zip",
  "bet-wise-quantify-fixed.zip",
]);

function addDirectory(currentDir, zipFolder) {
  const items = fs.readdirSync(currentDir);
  for (const item of items) {
    if (excludeList.has(item)) continue;
    const fullPath = path.join(currentDir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const subFolder = zipFolder.folder(item);
      addDirectory(fullPath, subFolder);
    } else if (stat.isFile()) {
      if (item === "andromeda-ai.zip") continue;
      const data = fs.readFileSync(fullPath);
      zipFolder.file(item, data);
    }
  }
}

console.log("Dodajem sve datoteke projekta u ZIP arhivu...");

// Dodaj sve stavke iz rootDir (osim node_modules, .git, .output, .wrangler, dist i zip-a)
const rootItems = fs.readdirSync(rootDir);
for (const item of rootItems) {
  if (excludeList.has(item)) continue;
  const fullPath = path.join(rootDir, item);
  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    const folder = zip.folder(item);
    addDirectory(fullPath, folder);
  } else if (stat.isFile()) {
    zip.file(item, fs.readFileSync(fullPath));
  }
}

console.log("Generiram komprimirani ZIP...");
const content = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 9 },
});

fs.writeFileSync(publicZipPath, content);
const fixedZipPath = path.join(rootDir, "public", "bet-wise-quantify-fixed.zip");
fs.writeFileSync(fixedZipPath, content);

const artifactDir = "/.aistudio/artifacts/brain/4fb08352-46ad-4c94-b788-cf6d06a17af5";
if (fs.existsSync(artifactDir)) {
  fs.writeFileSync(path.join(artifactDir, "bet-wise-quantify-fixed.zip"), content);
  console.log(`Kopirano i u artefakte: ${path.join(artifactDir, "bet-wise-quantify-fixed.zip")}`);
}

console.log(`Uspješno stvoren ${publicZipPath} i ${fixedZipPath} (${(content.length / 1024 / 1024).toFixed(2)} MB)`);
