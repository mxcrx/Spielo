const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const outputFile = "spielo-v1-structure.txt";
const excludedNames = new Set([
  ".git",
  "node_modules",
  "spielo-v1.zip",
  outputFile,
  ".env",
]);

function shouldExcludeEntry(entry) {
  return (
    excludedNames.has(entry.name) ||
    entry.name.toLowerCase().endsWith(".zip") ||
    (entry.name.startsWith(".env") && entry.name !== ".env.example")
  );
}

function listEntries(dirPath) {
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => !shouldExcludeEntry(entry))
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }

      return left.name.localeCompare(right.name, "de");
    });
}

function buildTree(dirPath, prefix = "") {
  const entries = listEntries(dirPath);
  const lines = [];

  entries.forEach((entry, index) => {
    const lastEntry = index === entries.length - 1;
    const branch = lastEntry ? "+-- " : "|-- ";
    const suffix = entry.isDirectory() ? "/" : "";
    const fullPath = path.join(dirPath, entry.name);

    lines.push(`${prefix}${branch}${entry.name}${suffix}`);

    if (entry.isDirectory()) {
      const childPrefix = prefix + (lastEntry ? "    " : "|   ");
      lines.push(...buildTree(fullPath, childPrefix));
    } else {
      const relativePath = path
        .relative(rootDir, fullPath)
        .split(path.sep)
        .join("/");
      const fileContent = fs.readFileSync(fullPath, "utf8");

      lines.push(`${prefix}    --- ${relativePath} ---`);
      lines.push(...fileContent.replace(/\r\n/g, "\n").split("\n"));
      lines.push(`${prefix}    --- end ${relativePath} ---`);
      lines.push("");
    }
  });

  return lines;
}

const projectName = path.basename(rootDir);
const outputLines = [`${projectName}/`, "", ...buildTree(rootDir)];

fs.writeFileSync(
  path.join(rootDir, outputFile),
  outputLines.join("\n"),
  "utf8",
);
