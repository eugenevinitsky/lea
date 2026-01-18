import * as fs from "fs";

const model = JSON.parse(fs.readFileSync("lib/classifier-model.json", "utf-8"));

async function analyzeBody() {
  // Fetch actual body from RSS
  const response = await fetch("https://frontierai.substack.com/feed");
  const xml = await response.text();

  const items = xml.split("<item>");
  for (const item of items.slice(1)) {
    const linkMatch = item.match(/<link>([^<]+)<\/link>/);
    if (linkMatch && linkMatch[1].includes("/p/data-is-your-only-moat")) {
      const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
      if (contentMatch) {
        const bodyText = contentMatch[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/&[^;]+;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 2000);

        const tokens = bodyText.toLowerCase().replace(/[^\w\s-]/g, " ").split(/\s+/).filter(t => t.length > 0);
        const known = tokens.filter(t => model.wordLogProbs.technical[t] !== undefined);
        const unknown = tokens.filter(t => model.wordLogProbs.technical[t] === undefined);

        console.log("Actual article body analysis (Data is your only moat):");
        console.log("  Total tokens:", tokens.length);
        console.log("  Known words:", known.length);
        console.log("  Unknown words:", unknown.length);
        console.log("  Unknown %:", ((unknown.length / tokens.length) * 100).toFixed(1) + "%");
        console.log("\n  Unknown words sample:", unknown.slice(0, 20).join(", "));

        // Calculate bias from unknown words
        const unknownDiff = model.unknownWordLogProb.technical - model.unknownWordLogProb["non-technical"];
        const cumulativeBias = unknown.length * unknownDiff;
        console.log("\n  Unknown word bias per word:", unknownDiff.toFixed(4));
        console.log("  Cumulative unknown word bias:", cumulativeBias.toFixed(3));
        console.log("  (Negative = pushes toward non-technical)");

        // Compute TF (term frequency)
        const tf: Record<string, number> = {};
        for (const t of tokens) {
          tf[t] = (tf[t] || 0) + 1;
        }
        for (const t in tf) {
          tf[t] /= tokens.length;
        }

        // WITHOUT TF-IDF (raw counts)
        let techScoreRaw = 0;
        let nonTechScoreRaw = 0;
        for (const t of tokens) {
          const techProb = model.wordLogProbs.technical[t] ?? model.unknownWordLogProb.technical;
          const nonTechProb = model.wordLogProbs["non-technical"][t] ?? model.unknownWordLogProb["non-technical"];
          techScoreRaw += techProb;
          nonTechScoreRaw += nonTechProb;
        }
        console.log("\n  WITHOUT TF-IDF:");
        console.log("    Tech score:", techScoreRaw.toFixed(2));
        console.log("    Non-tech score:", nonTechScoreRaw.toFixed(2));
        console.log("    Difference:", (techScoreRaw - nonTechScoreRaw).toFixed(2));
        console.log("    → Classification:", techScoreRaw > nonTechScoreRaw ? "TECHNICAL" : "NON-TECHNICAL");

        // WITH TF-IDF weighting
        let techScoreTfIdf = 0;
        let nonTechScoreTfIdf = 0;
        for (const [t, tfVal] of Object.entries(tf)) {
          const idf = model.idf[t] || 1;
          const weight = tfVal * idf;
          const techProb = model.wordLogProbs.technical[t] ?? model.unknownWordLogProb.technical;
          const nonTechProb = model.wordLogProbs["non-technical"][t] ?? model.unknownWordLogProb["non-technical"];
          techScoreTfIdf += weight * techProb;
          nonTechScoreTfIdf += weight * nonTechProb;
        }
        console.log("\n  WITH TF-IDF (using RAW margin, threshold 0.1):");
        console.log("    Tech score:", techScoreTfIdf.toFixed(2));
        console.log("    Non-tech score:", nonTechScoreTfIdf.toFixed(2));
        const rawMargin = techScoreTfIdf - nonTechScoreTfIdf;
        console.log("    Raw margin:", rawMargin.toFixed(4));
        console.log("    Threshold: 0.1");
        console.log("    → Classification:", rawMargin > 0.1 ? "TECHNICAL" : "NON-TECHNICAL");

        // Now compare to title only
        const titleText = "Data is your only moat How different adoption models drive better applications";
        const titleTokens = titleText.toLowerCase().replace(/[^\w\s-]/g, " ").split(/\s+/).filter(t => t.length > 0);
        const titleTf: Record<string, number> = {};
        for (const t of titleTokens) {
          titleTf[t] = (titleTf[t] || 0) + 1;
        }
        for (const t in titleTf) {
          titleTf[t] /= titleTokens.length;
        }
        let titleTechScore = 0;
        let titleNonTechScore = 0;
        for (const [t, tfVal] of Object.entries(titleTf)) {
          const idf = model.idf[t] || 1;
          const weight = tfVal * idf;
          const techProb = model.wordLogProbs.technical[t] ?? model.unknownWordLogProb.technical;
          const nonTechProb = model.wordLogProbs["non-technical"][t] ?? model.unknownWordLogProb["non-technical"];
          titleTechScore += weight * techProb;
          titleNonTechScore += weight * nonTechProb;
        }
        const titleRawMargin = titleTechScore - titleNonTechScore;
        console.log("\n  TITLE ONLY (for comparison):");
        console.log("    Tokens:", titleTokens.length);
        console.log("    Raw margin:", titleRawMargin.toFixed(4));
        console.log("    → Classification:", titleRawMargin > 0.1 ? "TECHNICAL" : "NON-TECHNICAL");

        return;
      }
    }
  }
}

analyzeBody();
