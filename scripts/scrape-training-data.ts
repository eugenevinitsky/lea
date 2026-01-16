/**
 * Scrape Substack RSS feeds to build training data for the classifier
 */

import * as fs from "fs";

interface TrainingExample {
  text: string;
  label: "technical" | "non-technical";
}

// Technical Substacks (AI, ML, science, research)
const TECHNICAL_SOURCES = [
  "simonwillison",           // AI/tech
  "astralcodexten",          // rationalism/science
  "oneusefulthing",          // AI education (Ethan Mollick)
  "aisnakeoil",              // AI analysis
  "thegradient",             // AI/ML research
  "importai",                // AI newsletter
  "lastweekinai",            // AI news
  "thesequence",             // ML/AI
  "alignmentforum",          // AI safety
  "machinelearnings",        // ML
  "datascienceweekly",       // Data science
  "deeplearningweekly",      // Deep learning
  "nlpnews",                 // NLP
  "quantamagazine",          // Science journalism (may not be substack)
  "noahpinion",              // Economics/policy (academic style)
  "strangeloopcanon",        // Tech/ideas
  "dynomight",               // Science/analysis
  "experimental-history",    // Science/psychology
  "constructionist",         // Tech/science
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

  // Save to new file first for review
  const outputPath = "data/training-data-expanded.json";
  fs.writeFileSync(outputPath, JSON.stringify(combined, null, 2));
  console.log(`\nSaved to ${outputPath}`);
  console.log("Review the data, then rename to training-data.json and run the training script.");
}

main();
