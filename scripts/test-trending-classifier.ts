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

async function main() {
  const testWithBody = process.argv.includes("--with-body");

  // Fetch all trending articles
  const response = await fetch("https://client-kappa-weld-68.vercel.app/api/substack/trending?limit=100&hours=168");
  const { posts } = await response.json();

  const results: any[] = [];

  for (const p of posts) {
    let text = [p.title || "", p.description || ""].filter(Boolean).join(" ");
    let bodyFetched = false;

    if (testWithBody && p.subdomain && p.slug) {
      const body = await fetchBodyFromRss(p.subdomain, p.slug);
      if (body) {
        text = [p.title || "", p.description || "", body].filter(Boolean).join(" ");
        bodyFetched = true;
      }
    }

    const result = classifyContent("", text);
    results.push({
      title: p.title?.slice(0, 60),
      author: p.author,
      mentions: p.mentionCount,
      isTechnical: result.isTechnical,
      margin: result.margin?.toFixed(3) || "N/A",
      hasBody: bodyFetched,
    });
  }

  const technical = results.filter((r: any) => r.isTechnical);
  const nonTechnical = results.filter((r: any) => r.isTechnical === false);

  console.log("CLASSIFICATION RESULTS (title+desc only)\n");
  console.log("=".repeat(80));

  console.log(`\n✅ TECHNICAL (${technical.length} articles):\n`);
  technical.forEach((r: any, i: number) => {
    console.log(`${i+1}. ${r.title}...`);
    console.log(`   Author: ${r.author} | Mentions: ${r.mentions} | Margin: ${r.margin}%`);
  });

  console.log(`\n${"=".repeat(80)}`);
  console.log(`\n❌ NON-TECHNICAL (${nonTechnical.length} articles):\n`);
  nonTechnical.forEach((r: any, i: number) => {
    console.log(`${i+1}. ${r.title}...`);
    console.log(`   Author: ${r.author} | Mentions: ${r.mentions} | Margin: ${r.margin}%`);
  });

  console.log(`\n${"=".repeat(80)}`);
  console.log(`\nSUMMARY: ${technical.length} technical, ${nonTechnical.length} non-technical out of ${posts.length} total`);
}

main();
