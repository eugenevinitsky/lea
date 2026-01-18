/**
 * Scrape more political content from Substack for non-technical training data
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as fs from 'fs';
import * as path from 'path';

interface TrainingExample {
  text: string;
  label: 'technical' | 'non-technical';
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8212;/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchBodyFromRss(subdomain: string): Promise<{ title: string; body: string }[]> {
  try {
    const feedUrl = `https://${subdomain}.substack.com/feed`;
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });
    if (!response.ok) {
      return [];
    }
    const xml = await response.text();
    const items = xml.split('<item>');
    const results: { title: string; body: string }[] = [];

    for (const item of items.slice(1)) {
      // Title might be in CDATA or plain text
      let title = '';
      const titleCdataMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
      const titlePlainMatch = item.match(/<title>([^<]+)<\/title>/);
      if (titleCdataMatch) {
        title = titleCdataMatch[1];
      } else if (titlePlainMatch) {
        title = titlePlainMatch[1];
      }

      // Content is usually in CDATA
      const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);

      if (title && contentMatch) {
        const body = stripHtml(contentMatch[1]).slice(0, 2000);
        if (body.length > 200) {
          results.push({
            title,
            body,
          });
        }
      }
    }
    return results;
  } catch (error) {
    console.error(`  Error fetching ${subdomain}:`, error);
    return [];
  }
}

// Search Substack for posts
async function searchSubstack(query: string, limit = 20): Promise<{ title: string; description: string; subdomain: string; slug: string }[]> {
  try {
    const searchUrl = `https://substack.com/api/v1/universal_search?query=${encodeURIComponent(query)}&type=posts&limit=${limit}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });
    if (!response.ok) return [];
    const data = await response.json();
    const posts = data.results || [];

    return posts.map((post: any) => {
      const pubUrl = post.publication?.base_url || '';
      const subdomainMatch = pubUrl.match(/https?:\/\/([^.]+)\.substack\.com/);
      return {
        title: post.title || '',
        description: post.subtitle || post.description || '',
        subdomain: subdomainMatch?.[1] || '',
        slug: post.slug || '',
      };
    }).filter((p: any) => p.subdomain && p.title);
  } catch {
    return [];
  }
}

// Known political newsletters on Substack
const POLITICAL_SUBDOMAINS = [
  // US Politics - Left/Liberal
  'heathercoxrichardson',  // Letters from an American
  'popularinformation',     // Judd Legum
  'aaronparnas',           // Aaron Parnas
  'meidastouch',           // MeidasTouch
  'luciantruscott',        // Lucian Truscott
  'thebulwark',            // The Bulwark
  'gregolear',             // Greg Olear
  'jessicavalenti',        // Jessica Valenti - Abortion Every Day
  'karfriedrichs',         // Political commentary
  'readthepresentage',     // The Present Age - Parker Molloy
  'thetriad',              // Jonathan Last
  'danpfeiffer',           // Dan Pfeiffer - Message Box
  'ericboehlert',          // Press Run
  'marfreed',              // Marc Elias - Democracy Docket
  'theinkl',               // The Ink - Anand Giridharadas
  'timothysnyder',         // Timothy Snyder - Thinking About
  'jayrosen',              // Press Think - Jay Rosen
  'matthewsheffield',      // Matthew Sheffield - Flux
  'publicnotice',          // Public Notice
  'thehandbasket',         // The Handbasket - Erin Reed
  'gaborsteingart',        // Pioneer Briefing

  // US Politics - Right/Conservative
  'mattgaetz',             // Matt Gaetz
  'glennbeck',             // Glenn Beck
  'charliekirk',           // Charlie Kirk
  'thefp',                 // The Free Press - Bari Weiss
  'commonsense',           // Common Sense - Bari Weiss (old)
  'theracket',             // The Racket
  'persuasion',            // Persuasion - Yascha Mounk
  'slow-boring',           // Slow Boring - Matt Yglesias

  // UK Politics
  'samf',                   // Sam Freedman
  'unherd',
  'thespectator',
  'iandunt',               // Ian Dunt
  'stephenkb',             // Stephen Bush
  'tomchivers',            // Tom Chivers
  'nickcohen',             // Nick Cohen

  // General Political Commentary
  'phillipspobrien',        // Phillips O'Brien (geopolitics)
  'rawstory',
  'foreignaffairs',
  'donsurber',             // Don Surber
  'michaelmoore',          // Michael Moore
  'tomwoodsgop',           // Tom Woods
  'taibbi',                // Matt Taibbi - Racket News
  'glennloury',            // Glenn Loury
  'andrewsullivan',        // Andrew Sullivan - The Weekly Dish
  'bariweiss',             // Bari Weiss
  'billkristol',           // Bill Kristol - The Bulwark
  'chrislhayes',           // Chris Hayes
  'ezraklein',             // Ezra Klein (older content)

  // Culture War / Social Issues
  'jessesingal',           // Jesse Singal - Singal-Minded
  'katieherzog',           // Katie Herzog - Blocked and Reported
  'freddiedeboer',         // Freddie deBoer
  'wesyang',               // Wesley Yang - Year Zero
  'leightonwoodhouse',     // Leighton Woodhouse
  'brettdevine',           // Culture commentary

  // International Politics
  'anneapplebaum',         // Anne Applebaum
  'yaaborowski',           // Eastern European politics
  'noahpinion',            // Noah Smith - economics/politics mix

  // More political commentators
  'davidfrum',             // David Frum
  'maxboot',               // Max Boot
  'jlotutt',               // Jennifer Rubin
  'hlotnick',              // Harry Litman
  'marcelias',             // Marc Elias
  'raborwalt',             // Raw Story
  'lincolnproject',        // Lincoln Project
  'projectfreedom',        // Political
  'voterprotection',       // Voter protection
  'democracydefense',      // Democracy defense

  // Lifestyle / Entertainment / Non-tech
  'cosmicfomo',            // Astrology
  'theastroloka',          // More astrology
  'astrologyanswers',      // Astrology answers
  'tarot',                 // Tarot readings
  'spiritualawakening',    // Spirituality
  'selfcare',              // Self care
  'mindfulnessmatters',    // Mindfulness
  'yogajournal',           // Yoga
  'foodandwine',           // Food
  'recipebox',             // Recipes
  'homecooking',           // Home cooking
  'gardeningtips',         // Gardening
  'plantsofinstagram',     // Plants
  'petlovers',             // Pets
  'doglife',               // Dogs
  'catpeople',             // Cats
  'parentingwin',          // Parenting
  'momlife',               // Mom life
  'dadstuff',              // Dad stuff
  'teacherlife',           // Teachers
  'nursesrock',            // Nurses
  'medschoollife',         // Med school (non-technical)
  'lawschoollife',         // Law school
  'gradschoolsurvivor',    // Grad school

  // Sports
  'theathletic',           // Sports
  'sportscenter',          // Sports
  'nflnews',               // NFL
  'nbanews',               // NBA
  'soccernews',            // Soccer
  'baseballnews',          // Baseball
  'hockeynews',            // Hockey
  'collegefootball',       // College football
  'fantasyhelp',           // Fantasy sports
  'sportsbetting',         // Sports betting

  // Entertainment / Pop Culture
  'popculturehappyhour',   // Pop culture
  'tvrecaps',              // TV recaps
  'moviereviews',          // Movie reviews
  'celebritynews',         // Celebrity news
  'musicnews',             // Music news
  'concertreviews',        // Concert reviews
  'bookrecommendations',   // Book recs (non-tech)
  'romancereads',          // Romance books
  'mysterythrillers',      // Mystery books
  'scifibooks',            // Sci-fi books (fiction)
  'fictionwriters',        // Fiction writing

  // Personal Finance (non-tech)
  'mrmoneymustache',       // Personal finance
  'financialindependence', // FIRE
  'budgeting101',          // Budgeting
  'debtfree',              // Debt free journey
  'retirementtips',        // Retirement
  'investingforbeginners', // Basic investing

  // Health / Wellness (non-tech)
  'drrubin',               // Dr. Rubin health commentary
  'healthnews',            // Health news
  'wellnessjourney',       // Wellness
  'mentalhealth',          // Mental health
  'anxietyhelp',           // Anxiety
  'depressionrecovery',    // Depression
  'therapytalk',           // Therapy
  'soberlife',             // Sobriety
  'addictionrecovery',     // Addiction recovery
  'eatingdisorderrecovery',// ED recovery
  'weightlossjourney',     // Weight loss
  'fitnessmotivation',     // Fitness
  'runningcommunity',      // Running
  'cyclinglife',           // Cycling
  'swimmerworld',          // Swimming

  // Travel / Lifestyle
  'traveldiaries',         // Travel
  'budgettravel',          // Budget travel
  'luxurytravel',          // Luxury travel
  'digitalnomads',         // Digital nomads (lifestyle)
  'expatlife',             // Expat life
  'movingabroad',          // Moving abroad

  // More news / current events
  'currentaffairs',        // Current affairs
  'worldnews',             // World news
  'abortioncoverage',      // Abortion news
  'climatecoverage',       // Climate news (policy)
  'immigrationnews',       // Immigration news
  'educationnews',         // Education news
  'healthcarepolicy',      // Healthcare policy

  // More lifestyle / culture
  'thecut',                // The Cut - lifestyle
  'refinery29',            // Refinery29
  'buzzfeed',              // Buzzfeed
  'vice',                  // Vice
  'vox',                   // Vox
  'theringer',             // The Ringer - sports/culture
  'defector',              // Defector - sports
  'aftermath',             // Aftermath - gaming culture
  'billsimmons',           // Bill Simmons

  // Food / Cooking
  'seriouseats',           // Serious Eats
  'bonappetit',            // Bon Appetit
  'smittenkitchen',        // Smitten Kitchen
  'halfbakedharvest',      // Half Baked Harvest
  'minimalistbaker',       // Minimalist Baker
  'cookieandkate',         // Cookie and Kate
  'loveandlemons',         // Love and Lemons
  'pinchofyum',            // Pinch of Yum
  'budgetbytes',           // Budget Bytes
  'sallysbakingaddiction', // Baking
  'kingarthurbaking',      // King Arthur

  // Parenting / Family
  'scarymommy',            // Scary Mommy
  'fatherly',              // Fatherly

  // Relationships
  'askmolly',              // Ask Molly
  'dearpolly',             // Dear Polly
  'captainawkward',        // Captain Awkward

  // History / Culture
  'atlasobscura',          // Atlas Obscura
  'aeonmagazine',          // Aeon
  'lithub',                // Literary Hub
  'electricliterature',    // Electric Lit
  'theparisreview',        // Paris Review

  // True Crime
  'truecrime',             // True crime
  'crimejunkie',           // Crime Junkie

  // Humor / Satire
  'mcsweeneys',            // McSweeney's
  'reductress',            // Reductress
  'hardtimes',             // Hard Times

  // Art / Design
  'hyperallergic',         // Art criticism
  'colossal',              // Art/design
  'dezeen',                // Architecture/design

  // Music
  'pitchfork',             // Pitchfork
  'stereogum',             // Stereogum
  'brooklynvegan',         // Brooklyn Vegan

  // Film / TV
  'indiewire',             // IndieWire
  'avclub',                // AV Club
  'vulture',               // Vulture

  // Self-help / Productivity
  'jamesclear',            // James Clear
  'markmanson',            // Mark Manson
  'ryanholiday',           // Ryan Holiday
  'brainpickings',         // Brain Pickings
  'farnamstreet',          // Farnam Street
  'waitbutwhy',            // Wait But Why
  'sahilbloom',            // Sahil Bloom

  // Culture newsletters
  'culturalstudy',         // Culture Study
  'annehelen',             // Anne Helen Petersen
  'griefbacon',            // Grief Bacon
  'haleynahman',           // Maybe Baby
  'garbageday',            // Garbage Day - internet culture
  'embedded',              // Embedded
  'readmax',               // Read Max

  // More political
  'theintercept',          // The Intercept
  'jacobin',               // Jacobin
  'currentaffairs',        // Current Affairs magazine
  'thenewrepublic',        // The New Republic
  'commentarymagazine',    // Commentary
  'nationalreview',        // National Review
  'weeklystandard',        // Weekly Standard
  'reason',                // Reason
  'cato',                  // Cato Institute
  'brookings',             // Brookings
  'heritage',              // Heritage Foundation
  'aei',                   // AEI
];

// Political search terms
const POLITICAL_SEARCHES = [
  'trump administration',
  'biden policy',
  'democrat republican',
  'congress senate vote',
  'election results',
  'political news',
  'maga conservative',
  'liberal progressive',
  'white house press',
  'supreme court ruling',
  'immigration policy',
  'border crisis',
  'january 6',
  'insurrection',
  'impeachment',
  'gop democrat',
  'midterm election',
  'campaign rally',
  'political scandal',
  'fox news msnbc',
  'washington dc politics',
  'federal government shutdown',
  'republican primary',
  'democratic primary',
  'swing state',
  'electoral college',
  'voter fraud claims',
  'political polarization',
];

async function main() {
  const trainingDataPath = path.join(__dirname, '../data/training-data.json');
  const trainingData: TrainingExample[] = JSON.parse(fs.readFileSync(trainingDataPath, 'utf-8'));

  console.log(`Current training data: ${trainingData.length} examples`);
  console.log(`  Technical: ${trainingData.filter(e => e.label === 'technical').length}`);
  console.log(`  Non-technical: ${trainingData.filter(e => e.label === 'non-technical').length}`);

  // Use title hash for deduplication (more precise)
  const existingTitles = new Set(
    trainingData.map(e => {
      // Extract just the title part (first line or first 50 chars before space)
      const firstLine = e.text.split('\n')[0];
      return firstLine.slice(0, 50).toLowerCase().trim();
    })
  );
  let added = 0;
  let duplicates = 0;

  // Method 1: Scrape from known political newsletters
  console.log('\n=== Scraping political newsletters ===');
  for (const subdomain of POLITICAL_SUBDOMAINS) {
    process.stdout.write(`  Fetching ${subdomain}...`);
    const posts = await fetchBodyFromRss(subdomain);
    let subAdded = 0;

    for (const post of posts) {
      const titleKey = post.title.slice(0, 50).toLowerCase().trim();
      if (existingTitles.has(titleKey)) {
        duplicates++;
        continue;
      }

      const text = `${post.title} ${post.body}`.trim();
      if (text.length < 100) continue;

      trainingData.push({ text, label: 'non-technical' });
      existingTitles.add(titleKey);
      added++;
      subAdded++;
    }

    console.log(` found ${posts.length}, added ${subAdded}`);

    // Rate limit
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`  Total added from newsletters: ${added} (${duplicates} duplicates skipped)`);

  // Skip search - API doesn't work reliably

  console.log(`\n=== Summary ===`);
  console.log(`Total added: ${added}`);
  console.log(`New training data: ${trainingData.length} examples`);
  console.log(`  Technical: ${trainingData.filter(e => e.label === 'technical').length}`);
  console.log(`  Non-technical: ${trainingData.filter(e => e.label === 'non-technical').length}`);

  // Save
  fs.writeFileSync(trainingDataPath, JSON.stringify(trainingData, null, 2));
  console.log(`\nSaved to ${trainingDataPath}`);
}

main().catch(console.error);
