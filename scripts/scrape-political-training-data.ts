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

  // ===== NON-ENGLISH POLITICAL/NEWS =====

  // French political/news
  'legrandcontinent',      // Le Grand Continent - French geopolitics
  'lalettredelexpansion',  // French business/politics
  'arretsurimages',        // French media criticism
  'mediapart',             // French investigative journalism
  'lepoint',               // Le Point - French news
  'lexpress',              // L'Express - French news
  'marianne',              // Marianne - French politics
  'liberation',            // Libération
  'lemonde',               // Le Monde
  'lefigaro',              // Le Figaro
  'franceinter',           // France Inter
  'franceinfo',            // France Info
  'lobs',                  // L'Obs
  'challenges',            // Challenges - French business
  'latribune',             // La Tribune
  'lesechos',              // Les Echos
  'courrierinternational', // Courrier International
  'philomag',              // Philosophie Magazine
  'lavidesidees',          // La Vie des Idées
  'aabordes',              // French political commentary
  'nicolasbaverez',        // French economics/politics
  'alaingresh',            // French Middle East politics

  // German political/news
  'derspiegel',            // Der Spiegel
  'zeit',                  // Die Zeit
  'faz',                   // FAZ
  'sueddeutsche',          // Süddeutsche Zeitung
  'welt',                  // Die Welt
  'taz',                   // TAZ
  'handelsblatt',          // Handelsblatt
  'nzz',                   // NZZ (Swiss German)
  'derstandard',           // Der Standard (Austrian)
  'profil',                // Profil (Austrian)
  'falter',                // Falter (Austrian)
  'republik',              // Republik (Swiss)
  'krautreporter',         // Krautreporter
  'uebermedien',           // Übermedien
  'netzpolitik',           // Netzpolitik
  'correctiv',             // Correctiv
  'katapult',              // Katapult Magazine

  // Spanish political/news
  'elpais',                // El País
  'elmundo',               // El Mundo
  'larazon',               // La Razón
  'abc',                   // ABC
  'elconfidencial',        // El Confidencial
  'eldiario',              // elDiario.es
  'publico',               // Público
  'infolibre',             // InfoLibre
  'ctxt',                  // CTXT
  'lamarearevista',        // La Marea
  'elespanol',             // El Español
  'vozpopuli',             // Vozpópuli
  'onda',                  // Onda Cero
  'elperiodico',           // El Periódico
  'lavanguardia',          // La Vanguardia
  'ara',                   // Ara (Catalan)
  'vilaweb',               // VilaWeb (Catalan)
  'naciodigital',          // NacióDigital (Catalan)

  // Dutch political/news
  'nrc',                   // NRC
  'volkskrant',            // De Volkskrant
  'trouw',                 // Trouw
  'parool',                // Het Parool
  'telegraaf',             // De Telegraaf
  'ad',                    // AD
  'nos',                   // NOS
  'rtv',                   // RTV
  'decorrespondent',       // De Correspondent
  'followthemoney',        // Follow the Money
  'joop',                  // Joop
  'geenstijl',             // GeenStijl
  'sargasso',              // Sargasso

  // Italian political/news
  'repubblica',            // La Repubblica
  'corriere',              // Corriere della Sera
  'lastampa',              // La Stampa
  'ilsole24ore',           // Il Sole 24 Ore
  'ilfoglio',              // Il Foglio
  'ilfattoquotidiano',     // Il Fatto Quotidiano
  'ilpost',                // Il Post
  'internazionale',        // Internazionale
  'espresso',              // L'Espresso
  'linkiesta',             // Linkiesta
  'agi',                   // AGI

  // Portuguese political/news
  'publico',               // Público (PT)
  'expresso',              // Expresso
  'observador',            // Observador
  'rtp',                   // RTP
  'dn',                    // Diário de Notícias
  'jn',                    // Jornal de Notícias
  'sol',                   // Sol
  'sabado',                // Sábado
  'visao',                 // Visão
  'folhadesaopaulo',       // Folha de São Paulo (BR)
  'estadao',               // Estadão (BR)
  'oglobo',                // O Globo (BR)
  'uol',                   // UOL (BR)
  'g1',                    // G1 (BR)

  // Polish political/news
  'gazetawyborcza',        // Gazeta Wyborcza
  'rzeczpospolita',        // Rzeczpospolita
  'wprost',                // Wprost
  'newsweekpl',            // Newsweek Polska
  'polityka',              // Polityka
  'tygodnikpowszechny',    // Tygodnik Powszechny
  'krytykapolityczna',     // Krytyka Polityczna
  'okopress',              // OKO.press
  'tokfm',                 // TOK FM
  'tvn24',                 // TVN24

  // Nordic political/news (Swedish, Norwegian, Danish)
  'dn',                    // Dagens Nyheter (SE)
  'svd',                   // Svenska Dagbladet (SE)
  'aftonbladet',           // Aftonbladet (SE)
  'expressen',             // Expressen (SE)
  'dagensarena',           // Dagens Arena (SE)
  'etc',                   // ETC (SE)
  'vg',                    // VG (NO)
  'aftenposten',           // Aftenposten (NO)
  'dagbladet',             // Dagbladet (NO)
  'nrk',                   // NRK (NO)
  'politiken',             // Politiken (DK)
  'berlingske',            // Berlingske (DK)
  'information',           // Information (DK)
  'weekendavisen',         // Weekendavisen (DK)
  'zetland',               // Zetland (DK)

  // Other European
  'kathimerini',           // Kathimerini (Greek)
  'tovima',                // To Vima (Greek)
  'hvg',                   // HVG (Hungarian)
  'index',                 // Index.hu (Hungarian)
  '444',                   // 444.hu (Hungarian)
  'denik',                 // Deník (Czech)
  'respekt',               // Respekt (Czech)
  'aktualne',              // Aktuálně.cz (Czech)
  'pravda',                // Pravda (Slovak)
  'sme',                   // SME (Slovak)
  'delfi',                 // Delfi (Baltic)

  // More Czech sources
  'seznamzpravy',          // Seznam Zprávy (Czech)
  'idnes',                 // iDNES (Czech)
  'novinky',               // Novinky.cz (Czech)
  'lidovky',               // Lidové noviny (Czech)
  'echo24',                // Echo24 (Czech)
  'forum24',               // Forum24 (Czech)
  'hlidacipes',            // Hlídací pes (Czech)
  'denikn',                // Deník N (Czech)
  'refresher',             // Refresher (Czech)
  'heroine',               // Heroine.cz (Czech women's)

  // More Slovak sources
  'dennikn',               // Denník N (Slovak)
  'aktuality',             // Aktuality.sk (Slovak)
  'hnonline',              // HN Online (Slovak)

  // More Portuguese/Brazilian sources
  'nexo',                  // Nexo Jornal (BR)
  'intercept',             // The Intercept Brasil
  'piauirevista',          // Piauí (BR)
  'brasil247',             // Brasil 247
  'cartacapital',          // Carta Capital (BR)
  'brasildefato',          // Brasil de Fato
  'correio',               // Correio Braziliense
  'gazetadopovo',          // Gazeta do Povo (BR)
  'sapo',                  // SAPO (PT)
  'tsf',                   // TSF (PT radio)
  'sicnoticias',           // SIC Notícias (PT)

  // More Spanish/Latin American sources
  'infobae',               // Infobae (Argentina)
  'clarin',                // Clarín (Argentina)
  'lanacion',              // La Nación (Argentina)
  'pagina12',              // Página 12 (Argentina)
  'perfil',                // Perfil (Argentina)
  'eluniversal',           // El Universal (Mexico)
  'reforma',               // Reforma (Mexico)
  'milenio',               // Milenio (Mexico)
  'animalpolitico',        // Animal Político (Mexico)
  'proceso',               // Proceso (Mexico)
  'latercera',             // La Tercera (Chile)
  'elmostrador',           // El Mostrador (Chile)
  'cooperativa',           // Cooperativa (Chile)
  'semana',                // Semana (Colombia)
  'eltiempo',              // El Tiempo (Colombia)
  'elespectador',          // El Espectador (Colombia)

  // More Dutch/Flemish sources
  'nieuwsblad',            // Het Nieuwsblad (Belgian)
  'standaard',             // De Standaard (Belgian)
  'morgen',                // De Morgen (Belgian)
  'knack',                 // Knack (Belgian)
  'vrtnws',                // VRT NWS (Belgian)

  // More German sources
  'bild',                  // Bild
  'focus',                 // Focus
  'merkur',                // Merkur
  'tagesspiegel',          // Tagesspiegel
  'rnd',                   // RedaktionsNetzwerk Deutschland
  'mdr',                   // MDR
  'br24',                  // BR24
  'watson',                // Watson.de

  // Russian (for Russian-speaking communities)
  'meduza',                // Meduza
  'novayagazeta',          // Novaya Gazeta
  'thebell',               // The Bell
  'currenttime',           // Current Time

  // Turkish
  'hurriyet',              // Hürriyet
  'sabah',                 // Sabah
  'cumhuriyet',            // Cumhuriyet
  'sozcu',                 // Sözcü
  't24',                   // T24
  'bianet',                // Bianet

  // Arabic
  'alarabiya',             // Al Arabiya
  'aljazeera',             // Al Jazeera
  'alhurra',               // Alhurra

  // Japanese
  'asahi',                 // Asahi Shimbun
  'mainichi',              // Mainichi
  'yomiuri',               // Yomiuri
  'nikkei',                // Nikkei

  // Korean
  'chosun',                // Chosun Ilbo
  'joongang',              // JoongAng Ilbo
  'hankyoreh',             // Hankyoreh

  // Chinese (traditional/simplified)
  'mingpao',               // Ming Pao
  'appledaily',            // Apple Daily
  'initium',               // Initium Media

  // Non-English lifestyle/culture
  'madamefigaro',          // Madame Figaro (French lifestyle)
  'grazia',                // Grazia (various languages)
  'elle',                  // Elle (various languages)
  'vogue',                 // Vogue (various languages)
  'gala',                  // Gala (German celebrity)
  'bunte',                 // Bunte (German celebrity)
  'stern',                 // Stern (German)
  'brigitte',              // Brigitte (German women's)
  'hola',                  // Hola (Spanish celebrity)
  'pronto',                // Pronto (Spanish celebrity)
  'chi',                   // Chi (Italian celebrity)
  'oggi',                  // Oggi (Italian)
  'vanityitalia',          // Vanity Fair Italia
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
