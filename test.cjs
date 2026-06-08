const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;
const OUTPUT_FILE = path.join(ROOT_DIR, "output.txt");

// Список конкретных файлов, которые игнорируем
const IGNORE_FILES = new Set([
   "package-lock.json",
   "output.txt"
   , ".DS_Store"
   , "data.json"
   , "test.json"
   , "composer.lock"
   , "Homestead.json"
   , "Homestead.yaml"
   , "npm-debug.log",
   "yarn-error.log",
   "import-manifest.json",
   "reference_vectors.json",
   "promo_prices.json",
   "source-products-cache.json",

]);

const IGNORE_EXTENSIONS = new Set([
   // images
   ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".ico",
   // video
   ".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv",
   // database dumps & binary files
   ".dump", ".sql", ".tar", ".gz", ".zip", ".rar", ".ttf", ".otf", ".exe", ".dll", ".bin", ".xls", ".xlsx", ".DS_Store", ".pyc", ".pem", ".key", ".crt", ".pfx", ".p12", ".log", ".tmp", ".cache", ".bak", ".swp", ".swo", ".class", ".jar", ".war", ".ear", ".py", ".pyd", ".ipynb", ".csv", ".tsv", ".jsonl", ".ndjson", ".avro", ".parquet", ".orc", ".hdf5", ".db", ".sqlite", ".sqlite3", ".db3", ".sqlitedb", ".dump.sql", ".backup.sql", ".DS_Store", ".docx", ".xlsx", ".pptx", ".doc", ".xls", ".ppt", ".pdf", ".psd", ".ai", ".indd", ".xd", ".sketch", ".fig", ".afdesign", ".c4d", ".blend", ".3ds", ".max", ".fbx", ".obj", ".stl", ".ply", ".glb", ".gltf", ".md", ".css", ".txt", ".pyi", ".lib", ".phpactor.json", ".phpunit.result.cache",
   ".editorconfig", ".gitattributes", ".prettierignore", ".eslintignore", ".dockerignore", ".npmignore", ".yarnignore", ".cmd", ".sql", ".onnx", ".pb", ".pbtxt", ".h5", ".hdf5", ".ckpt", ".pt", ".pth", ".bin", ".zip", ".tar.gz", ".tar.bz2", ".tar.xz", ".7z", ".rar", ".gz", ".bz2", ".xz",
]);

const IGNORE_DIRECTORIES = new Set([
   "node_modules", ".git", ".idea", ".vscode", "dist", "build", ".DS_Store", "public", "vendor", "bootstrap", "lang", ".editorconfig", ".gitattributes", ".prettierignore", ".eslintignore", ".dockerignore", ".npmignore", ".yarnignore", ".venv",
]);

function isIgnoredFile(filePath, fileName) {
   // 1. Игнорируем по имени файла (package-lock.json, output.txt и т.д.)
   if (IGNORE_FILES.has(fileName)) return true;

   // 2. Игнорируем по расширению
   const ext = path.extname(filePath).toLowerCase();
   return IGNORE_EXTENSIONS.has(ext);
}

function walk(dir) {
   const entries = fs.readdirSync(dir, { withFileTypes: true });

   for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
         if (IGNORE_DIRECTORIES.has(entry.name)) continue;
         walk(fullPath);
      } else if (entry.isFile()) {
         // Передаем и полный путь, и имя файла
         if (isIgnoredFile(fullPath, entry.name)) continue;

         let content;
         try {
            content = fs.readFileSync(fullPath, "utf8");
         } catch (e) {
            continue;
         }

         const relativePath = path.relative(ROOT_DIR, fullPath);

         fs.appendFileSync(
            OUTPUT_FILE,
            `--- FILE: ${relativePath}\n` +
            `--- BEGIN\n` +
            `${content}\n` +
            `--- END\n\n`,
            "utf8"
         );
      }
   }
}

// Очистка и запуск
fs.writeFileSync(OUTPUT_FILE, `# Dump generated at ${new Date().toISOString()}\n\n`, "utf8");
walk(ROOT_DIR);

console.log("Готово. Файл output.txt создан/обновлен.");