import fs from "fs";
import path from "path";

// List of brand/fund/merchant names from the mock data that must NOT be hardcoded in application logic
const FORBIDDEN_WORDS = [
  "SAFFRON",
  "SENTINEL",
  "APEX GOLD",
  "ZEPTO",
  "SWIGGY",
  "INDIGO",
  "CHAAYOS",
  "ZOMATO",
  "BLINKIT",
  "APOLLO PHARMACY",
  "STARBUCKS",
  "BOOKMYSHOW",
  "MYNTRA",
  "CULTFIT",
  "CULT FIT"
];

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      // Exclude evals and scripts directory from checking (since they can reference expected results for checking)
      if (file !== "evals" && file !== "node_modules" && file !== ".git" && file !== "dist") {
        arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
      }
    } else {
      if (fullPath.endsWith(".ts") || fullPath.endsWith(".js")) {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}

function main() {
  console.log("🔍 Running Static Generalization Code Check...");
  
  const srcDir = path.resolve("./src");
  if (!fs.existsSync(srcDir)) {
    console.error("❌ ERROR: src directory not found.");
    process.exit(1);
  }

  const files = getAllFiles(srcDir);
  console.log(`Found ${files.length} source file(s) to scan (excluding evals & scripts)...`);

  let violationsCount = 0;

  files.forEach((file) => {
    const content = fs.readFileSync(file, "utf-8");
    const upperContent = content.toUpperCase();

    FORBIDDEN_WORDS.forEach((word) => {
      // Simple exact match check. We ignore imports or comments if they are not present, but standard check is strict.
      if (upperContent.includes(word)) {
        // Double check if it's in a comment (e.g. // e.g. Swiggy) which is fine, but to be safe let's flag all occurrences and let candidate clean it up.
        // Wait, comments like "e.g. Swiggy" are fine, but let's check.
        // Let's print the line containing it.
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          if (line.toUpperCase().includes(word)) {
            // Check if it's just a comment or description
            const isComment = line.trim().startsWith("//") || line.trim().startsWith("*") || line.trim().startsWith("/*");
            if (!isComment) {
              console.log(`❌ VIOLATION in ${path.relative(process.cwd(), file)}:L${idx+1}`);
              console.log(`   Found forbidden word "${word}": "${line.trim()}"`);
              violationsCount++;
            }
          }
        });
      }
    });
  });

  console.log("\n=================================");
  console.log("📊 GENERALIZATION CHECK RESULT:");
  console.log(`   Violations Found: ${violationsCount}`);
  console.log("=================================\n");

  if (violationsCount > 0) {
    console.error("❌ Generalization check failed. Hardcoded brand/fund identifiers found in codebase.");
    process.exit(1);
  } else {
    console.log("✅ Generalization check passed! Codebase is free of hardcoded sample parameters.");
    process.exit(0);
  }
}

main();
