import { classifyContent } from "../lib/substack-classifier";

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[^;]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchBodyFromRss(subdomain: string, slug: string): Promise<string | null> {
  try {
    const feedUrl = `https://${subdomain}.substack.com/feed`;
    const response = await fetch(feedUrl, {
      headers: { "User-Agent": "Lea/1.0", "Accept": "application/rss+xml" },
    });
    if (!response.ok) return null;
    const xml = await response.text();
    const items = xml.split("<item>");
    for (const item of items.slice(1)) {
      const linkMatch = item.match(/<link>([^<]+)<\/link>/);
      if (linkMatch && linkMatch[1].includes(`/p/${slug}`)) {
        const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
        if (contentMatch) {
          return stripHtml(contentMatch[1]).slice(0, 2000);
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Test articles - mix of technical and political
const testArticles = [
  // Technical
  { subdomain: "frontierai", slug: "data-is-your-only-moat", title: "Data is your only moat", desc: "How different adoption models drive better applications", expected: "technical" },
  { subdomain: "oneusefulthing", slug: "what-just-happened", title: "What Just Happened", desc: "The implications of new AI developments", expected: "technical" },
  // Political
  { subdomain: "marytrump", slug: "endangering-lives-is-the-policy", title: "Endangering Lives Is the Policy", desc: "Public health dismantled in service of ideology and power", expected: "non-technical" },
  { subdomain: "kenklippenstein", slug: "21-secret-ice-programs-revealed", title: "21 Secret ICE Programs Revealed", desc: "Leaked documents detail the dizzying scope of ICE operations", expected: "non-technical" },
  { subdomain: "popularinformation", slug: "these-companies-are-advertising-on", title: "These companies advertised on X as Grok produced sexualized images", desc: "At least 37 major companies were advertising on the platform", expected: "non-technical" },
];

async function main() {
  console.log("BODY TEXT CLASSIFICATION TEST\n");
  console.log("=".repeat(80));
  console.log("\nThreshold: 0.65 (raw margin)\n");

  for (const article of testArticles) {
    const body = await fetchBodyFromRss(article.subdomain, article.slug);

    // Title + desc only
    const titleDescText = [article.title, article.desc].filter(Boolean).join(" ");
    const titleDescResult = classifyContent("", titleDescText);

    // With body
    const withBodyText = [article.title, article.desc, body || ""].filter(Boolean).join(" ");
    const withBodyResult = classifyContent("", withBodyText);

    const titleLabel = titleDescResult.isTechnical ? "✅ TECH" : "❌ NON-TECH";
    const bodyLabel = withBodyResult.isTechnical ? "✅ TECH" : "❌ NON-TECH";
    const expectedLabel = article.expected === "technical" ? "TECH" : "NON-TECH";

    const titleCorrect = (titleDescResult.isTechnical && article.expected === "technical") ||
                         (!titleDescResult.isTechnical && article.expected === "non-technical");
    const bodyCorrect = (withBodyResult.isTechnical && article.expected === "technical") ||
                        (!withBodyResult.isTechnical && article.expected === "non-technical");

    console.log(`${article.title.slice(0, 50)}...`);
    console.log(`  Expected: ${expectedLabel}`);
    console.log(`  Title+Desc: ${titleLabel} (margin: ${titleDescResult.margin?.toFixed(3)}) ${titleCorrect ? "✓" : "✗"}`);
    console.log(`  With Body:  ${bodyLabel} (margin: ${withBodyResult.margin?.toFixed(3)}) ${bodyCorrect ? "✓" : "✗"} [${body ? body.length + " chars" : "no body"}]`);
    console.log("");
  }
}

main();
