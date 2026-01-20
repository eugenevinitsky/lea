/**
 * Scrape Substack RSS feeds to build training data for the classifier
 */

import * as fs from "fs";

interface TrainingExample {
  text: string;
  label: "technical" | "non-technical";
}

// Technical Substacks (AI, ML, science, research, programming)
const TECHNICAL_SOURCES = [
  // AI/ML
  "astralcodexten",          // rationalism/science
  "oneusefulthing",          // AI education (Ethan Mollick)
  "aisnakeoil",              // AI analysis
  "thegradient",             // AI/ML research
  "importai",                // AI newsletter
  "lastweekinai",            // AI news
  "thesequence",             // ML/AI
  "machinelearnings",        // ML
  "datascienceweekly",       // Data science
  "deeplearningweekly",      // Deep learning
  "nlpnews",                 // NLP
  "strangeloopcanon",        // Tech/ideas
  "dynomight",               // Science/analysis
  "experimental-history",    // Science/psychology
  "aiweirdness",             // AI humor/tech
  "aisupremacy",             // AI analysis
  "latent-space",            // AI/ML engineering
  "semianalysis",            // Semiconductors/AI hardware
  "chinatalk",               // China tech policy
  "interconnects",           // Tech/AI analysis
  "transformernews",         // Transformer models
  "generativeai",            // Generative AI
  "promptengineering",       // Prompt engineering
  "llmnews",                 // LLM news
  "aimodels",                // AI models

  // Programming/Software Engineering
  "pragmaticengineer",       // Software engineering
  "bytebytego",              // System design
  "theengineeringmanager",   // Engineering management
  "lethain",                 // Engineering leadership (Will Larson)
  "softwareleadweekly",      // Software leadership
  "architecturenotes",       // Software architecture
  "levelupsoftware",         // Software development
  "highgrowthengineer",      // Engineering career
  "refactoring",             // Code quality
  "thecodist",               // Programming
  "programmingdigest",       // Programming digest
  "codinghorror",            // Programming (Jeff Atwood)
  "martinfowler",            // Software patterns
  "devopsish",               // DevOps
  "kubernetesweekly",        // Kubernetes
  "dockerweekly",            // Docker
  "cloudnative",             // Cloud native
  "serverlessland",          // Serverless
  "awsweekly",               // AWS
  "gcpweekly",               // Google Cloud
  "azureweekly",             // Azure

  // Web Development
  "javascriptweekly",        // JavaScript
  "reactnewsletter",         // React
  "vuenewsletter",           // Vue
  "angularweekly",           // Angular
  "typescriptweekly",        // TypeScript
  "nodeweekly",              // Node.js
  "frontendfoc",             // Frontend
  "cssweekly",               // CSS
  "webdesignweekly",         // Web design
  "a11yweekly",              // Accessibility
  "tailwindweekly",          // Tailwind CSS
  "sveltesociety",           // Svelte
  "solidjs",                 // SolidJS

  // Data/Analytics
  "dataeng",                 // Data engineering
  "dataengineeringweekly",   // Data engineering
  "analyticsweekly",         // Analytics
  "sqlweekly",               // SQL
  "dbtcloud",                // dbt
  "snowflakeweekly",         // Snowflake
  "databricks",              // Databricks
  "sparkweekly",             // Apache Spark
  "kafkaweekly",             // Apache Kafka
  "airflowweekly",           // Airflow

  // Security/Crypto
  "tldrsec",                 // Security
  "securityweekly",          // Security news
  "cryptographyeng",         // Cryptography
  "bugbountyweekly",         // Bug bounty
  "pentestweekly",           // Penetration testing
  "zerodayweekly",           // Zero day news
  "blockchainweekly",        // Blockchain

  // Mobile
  "androidweekly",           // Android
  "iosdevweekly",            // iOS
  "swiftweekly",             // Swift
  "kotlinweekly",            // Kotlin
  "flutterweekly",           // Flutter
  "reactnativeweekly",       // React Native

  // Languages
  "pythonweekly",            // Python
  "goweekly",                // Go
  "rustweekly",              // Rust
  "rubyweekly",              // Ruby
  "phpweekly",               // PHP
  "elixirweekly",            // Elixir
  "scalaweekly",             // Scala
  "haskellweekly",           // Haskell
  "clojureweekly",           // Clojure
  "julialang",               // Julia
  "cppweekly",               // C++
  "dotnetweekly",            // .NET

  // Hardware/Systems
  "embeddedfm",              // Embedded systems
  "lowlevelprogramming",     // Low level programming
  "systemsprogramming",      // Systems programming
  "computerarchitecture",    // Computer architecture
  "fpgaweekly",              // FPGA
  "iotweekly",               // IoT
  "roboticsweekly",          // Robotics

  // Science/Math
  "mathweekly",              // Mathematics
  "physicstoday",            // Physics
  "chemistryworld",          // Chemistry
  "biologyweekly",           // Biology
  "neuroscienceweekly",      // Neuroscience
  "climateweekly",           // Climate science
  "astronomyweekly",         // Astronomy
  "quantumweekly",           // Quantum computing

  // Research/Academia
  "arxivdaily",              // arXiv papers
  "paperswithcode",          // ML papers
  "researchhighlights",      // Research highlights
  "academicwriting",         // Academic writing
  "phdlife",                 // PhD research
  "gradschool",              // Graduate school research

  // Tech Business/Industry
  "stratechery",             // Tech strategy (Ben Thompson)
  "platformer",              // Tech platforms
  "bigtech",                 // Big tech analysis
  "techmeme",                // Tech news
  "hackernewsletter",        // Hacker News digest
  "morningbrew",             // Tech business
  "theprofile",              // Tech profiles

  // Specific Tech Topics
  "gamedevweekly",           // Game development
  "graphicsweekly",          // Computer graphics
  "audioweekly",             // Audio engineering
  "videoweekly",             // Video technology
  "3dweekly",                // 3D graphics
  "vrweekly",                // VR/AR
  "webglweekly",             // WebGL
  "openglweekly",            // OpenGL
  "vulkanweekly",            // Vulkan
  "unityweekly",             // Unity
  "unrealweekly",            // Unreal Engine

  // DevTools
  "gitweekly",               // Git
  "vscodeweekly",            // VS Code
  "neovimweekly",            // Neovim
  "terminalweekly",          // Terminal tools
  "linuxweekly",             // Linux
  "bashweekly",              // Bash/Shell
  "cliweekly",               // CLI tools
];

// Political/news Substacks (non-technical)
const POLITICAL_SOURCES = [
  "marytrump",               // Political commentary
  "popularinformation",      // Political investigations
  "thecontrarian",           // Political roundup
  "heathercoxrichardson",    // Political history/commentary
  "tnr",                     // The New Republic
  "thebulwark",              // Political commentary
  "defector",                // Sports/culture/politics
  "discourseblog",           // Political commentary
  "grantland",               // Sports/culture
  "currentaffairs",          // Political/cultural
  "theatlantic",             // News/politics
  "dailykos",                // Political
  "crooked",                 // Political (Crooked Media)
  "kenklippenstein",         // Investigative journalism
  "dropsite",                // Investigative journalism
  "jessesingal",             // Culture/politics
];

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchRssFeed(subdomain: string): Promise<string | null> {
  try {
    const feedUrl = `https://${subdomain}.substack.com/feed`;
    console.log(`  Fetching ${feedUrl}...`);

    const response = await fetch(feedUrl, {
      headers: {
        "User-Agent": "Lea/1.0 (mailto:support@lea.community)",
        "Accept": "application/rss+xml, application/xml, text/xml",
      },
    });

    if (!response.ok) {
      console.log(`  ❌ Failed: ${response.status}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.log(`  ❌ Error: ${error}`);
    return null;
  }
}

function parseRssFeed(xml: string, label: "technical" | "non-technical"): TrainingExample[] {
  const examples: TrainingExample[] = [];
  const items = xml.split("<item>");

  for (const item of items.slice(1)) {
    // Extract title
    const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                       item.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? stripHtml(titleMatch[1]) : "";

    // Extract description
    const descMatch = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
                      item.match(/<description>([^<]+)<\/description>/);
    const description = descMatch ? stripHtml(descMatch[1]) : "";

    // Extract body content
    const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
    const body = contentMatch ? stripHtml(contentMatch[1]).slice(0, 2000) : "";

    // Combine into training text
    const text = [title, description, body].filter(Boolean).join(" ").trim();

    if (text.length > 100) {  // Only include substantial articles
      examples.push({ text, label });
    }
  }

  return examples;
}

async function scrapeSource(subdomain: string, label: "technical" | "non-technical"): Promise<TrainingExample[]> {
  const xml = await fetchRssFeed(subdomain);
  if (!xml) return [];

  const examples = parseRssFeed(xml, label);
  console.log(`  ✅ Found ${examples.length} articles`);
  return examples;
}

async function main() {
  const allExamples: TrainingExample[] = [];

  console.log("\n=== Scraping TECHNICAL sources ===\n");
  for (const source of TECHNICAL_SOURCES) {
    const examples = await scrapeSource(source, "technical");
    allExamples.push(...examples);
    // Small delay to be polite
    await new Promise(r => setTimeout(r, 500));
  }

  console.log("\n=== Scraping POLITICAL sources ===\n");
  for (const source of POLITICAL_SOURCES) {
    const examples = await scrapeSource(source, "non-technical");
    allExamples.push(...examples);
    await new Promise(r => setTimeout(r, 500));
  }

  // Load existing training data
  const existingPath = "data/training-data.json";
  let existingData: TrainingExample[] = [];
  if (fs.existsSync(existingPath)) {
    existingData = JSON.parse(fs.readFileSync(existingPath, "utf-8"));
    console.log(`\nLoaded ${existingData.length} existing examples`);
  }

  // Dedupe by text (first 200 chars)
  const seen = new Set<string>();
  for (const ex of existingData) {
    seen.add(ex.text.slice(0, 200));
  }

  const newExamples = allExamples.filter(ex => !seen.has(ex.text.slice(0, 200)));
  console.log(`Found ${newExamples.length} new examples (${allExamples.length - newExamples.length} duplicates)`);

  // Combine and save
  const combined = [...existingData, ...newExamples];
  const techCount = combined.filter(e => e.label === "technical").length;
  const nonTechCount = combined.filter(e => e.label === "non-technical").length;

  console.log(`\nTotal: ${combined.length} examples (${techCount} technical, ${nonTechCount} non-technical)`);

  // Save directly to training-data.json
  fs.writeFileSync(existingPath, JSON.stringify(combined, null, 2));
  console.log(`\nSaved to ${existingPath}`);
}

main();
