/**
 * Build a balanced test dataset for classifier FPR validation
 * Uses high-confidence examples that are NOT in training data
 */

import * as fs from 'fs';
import * as path from 'path';

interface CleanupResult {
  title: string | null;
  probability: number;
}

interface TrainingExample {
  text: string;
  label: 'technical' | 'non-technical';
}

const cleanupPath = path.join(__dirname, '../data/cleanup-results.json');
const trainingPath = path.join(__dirname, '../data/training-data.json');
const testPath = path.join(__dirname, '../data/classifier-test-data.json');

// Load data
const cleanupResults = JSON.parse(fs.readFileSync(cleanupPath, 'utf-8'));
const trainingData: TrainingExample[] = JSON.parse(fs.readFileSync(trainingPath, 'utf-8'));

// Create set of training texts for deduplication
const trainingTexts = new Set(trainingData.map(e => e.text.toLowerCase().trim()));

console.log(`Cleanup: ${cleanupResults.kept.length} kept, ${cleanupResults.removed.length} removed`);
console.log(`Training data: ${trainingData.length} examples`);

// Get high-confidence non-technical (probability < 0.35) not in training
const highConfNonTech = cleanupResults.removed
  .filter((r: CleanupResult) =>
    r.title &&
    r.title.length >= 10 &&
    r.probability < 0.35 &&
    !trainingTexts.has(r.title.toLowerCase().trim())
  )
  .map((r: CleanupResult) => r.title);

// Get high-confidence technical (probability > 0.75) not in training
const highConfTech = cleanupResults.kept
  .filter((r: CleanupResult) =>
    r.title &&
    r.title.length >= 10 &&
    r.probability > 0.75 &&
    !trainingTexts.has(r.title.toLowerCase().trim())
  )
  .map((r: CleanupResult) => r.title);

console.log(`\nHigh-confidence non-technical (not in training): ${highConfNonTech.length}`);
console.log(`High-confidence technical (not in training): ${highConfTech.length}`);

// Add manually curated political examples that are common failure cases
const curatedNonTech = [
  // Political - US
  "Trump announces new tariffs on Chinese goods",
  "Biden administration releases climate report",
  "Senate passes bipartisan infrastructure bill",
  "MAGA rally draws thousands in Florida",
  "Republican primary debate highlights",
  "Democratic convention keynote speech",
  "Congress votes on debt ceiling",
  "White House press briefing on immigration",
  "Supreme Court ruling on abortion rights",
  "Midterm election results analysis",
  "Presidential approval ratings drop",
  "Speaker of the House election drama",
  "Filibuster reform debate continues",
  "Electoral college controversy",
  "Swing state polling analysis",
  "Campaign finance reform proposal",
  "Voter registration deadline approaches",
  "Political action committee spending report",
  "Gubernatorial race tightens",
  "State legislature passes controversial bill",

  // Political - International
  "Gaza ceasefire negotiations continue",
  "Ukraine receives new military aid package",
  "Putin warns NATO against expansion",
  "NATO summit addresses security concerns",
  "EU sanctions on Russia extended",
  "Israeli-Palestinian peace talks resume",
  "North Korea missile test condemned",
  "Climate activists protest at COP30",
  "Brexit trade deal amendments proposed",
  "Mexican border wall funding debate",
  "Hong Kong democracy protests continue",
  "Venezuelan opposition leader speaks",
  "Iranian nuclear deal negotiations",
  "Afghanistan withdrawal anniversary",
  "Syrian refugee crisis deepens",
  "Taiwan strait tensions rise",
  "South China Sea dispute escalates",
  "UN Security Council deadlock",
  "G7 summit joint statement released",
  "World leaders gather at Davos",

  // Lifestyle - Health & Fitness
  "My weight loss journey this year",
  "Fitness routine for busy professionals",
  "Yoga poses for back pain relief",
  "Intermittent fasting results after 30 days",
  "Best supplements for energy",
  "How I quit sugar for good",
  "Morning routine for productivity",
  "Sleep hygiene tips that actually work",
  "Mental health awareness month",
  "Burnout recovery strategies",

  // Lifestyle - Food & Cooking
  "Vegan recipes everyone will love",
  "Best restaurants in the city",
  "Wine tasting guide for beginners",
  "Meal prep ideas for the week",
  "Sourdough bread baking tutorial",
  "Coffee brewing methods compared",
  "Healthy smoothie recipes",
  "Budget grocery shopping tips",
  "Food photography for Instagram",
  "Seasonal produce guide",

  // Lifestyle - Home & Garden
  "Home decoration ideas on a budget",
  "Gardening tips for urban apartments",
  "DIY home improvement projects",
  "Interior design trends for 2026",
  "Minimalist living room makeover",
  "Organizing your closet efficiently",
  "Houseplant care for beginners",
  "Furniture restoration project",
  "Smart home setup guide",
  "Decluttering your space",

  // Lifestyle - Relationships & Family
  "Marriage advice from relationship experts",
  "Parenting advice for toddlers",
  "Dating app tips for over 40s",
  "How to maintain long-distance relationships",
  "Family vacation planning guide",
  "Teaching kids about money",
  "Navigating in-law relationships",
  "Dealing with teenager attitudes",
  "Making time for your partner",
  "Friendship maintenance in your 30s",

  // Entertainment & Media
  "Best movies of the year ranked",
  "Music festival lineup announced",
  "Book club recommendations for summer",
  "Podcast recommendations for commuters",
  "Celebrity wedding of the year",
  "Award show predictions",
  "Streaming service comparison",
  "Concert ticket buying tips",
  "Video game reviews this month",
  "True crime documentary analysis",

  // Finance & Business (non-tech)
  "Real estate market crash predicted",
  "Retirement planning strategies",
  "Stock market volatility explained",
  "Crypto investment warnings",
  "Side hustle ideas for extra income",
  "Budgeting tips for millennials",
  "Tax preparation checklist",
  "Insurance comparison guide",
  "Mortgage rate predictions",
  "Credit score improvement tips",

  // Travel & Leisure
  "Best vacation spots for families",
  "Travel photography tips",
  "Budget travel hacks",
  "Solo travel safety tips",
  "Best beaches in the world",
  "Road trip planning guide",
  "Airline loyalty programs compared",
  "Packing tips for light travel",
  "Hidden gem destinations",
  "Travel insurance explained",

  // Sports
  "Sports betting tips for beginners",
  "Super Bowl predictions",
  "Fantasy football draft strategy",
  "Olympics coverage highlights",
  "Local team playoff hopes",
  "Player trade rumors",
  "Championship game analysis",
  "Sports injury prevention",
  "Youth sports coaching tips",
  "Marathon training schedule",

  // Miscellaneous Non-Tech
  "Horoscope predictions for Aries",
  "Pet care tips for new dog owners",
  "Meditation techniques for anxiety",
  "Best podcasts of the year",
  "Memoir of my grandfather",
  "Poetry collection review",
  "Art gallery exhibition review",
  "Local community events this weekend",
  "Volunteer opportunities near you",
  "Charity fundraiser announcement",

  // Non-English (should be rejected)
  "Les meilleurs restaurants de Paris",
  "Politische Krise in Deutschland",
  "La situación económica en España",
  "Новости политики России",
  "中国经济发展报告",
  "日本の政治ニュース",
  "البرلمان العربي يناقش",
  "Eleições no Brasil 2026",
  "Nederlandse verkiezingen update",
  "Итальянская политика сегодня",
];

const curatedTech = [
  // Web Development
  "How to build a REST API with Node.js and Express",
  "Understanding React hooks and state management",
  "Vue.js 3 composition API deep dive",
  "Next.js server-side rendering tutorial",
  "Angular dependency injection patterns",
  "Svelte reactive declarations explained",
  "Building Progressive Web Apps with service workers",
  "CSS Grid and Flexbox layout techniques",
  "WebSocket real-time communication tutorial",
  "GraphQL vs REST API design comparison",

  // DevOps & Infrastructure
  "Kubernetes deployment best practices for production",
  "Docker containerization for beginners",
  "CI/CD pipeline setup with GitHub Actions",
  "Terraform infrastructure as code basics",
  "Ansible automation for DevOps",
  "Prometheus monitoring and alerting",
  "Nginx reverse proxy configuration",
  "AWS Lambda serverless architecture guide",
  "Azure DevOps pipeline configuration",
  "Google Cloud Run deployment tutorial",

  // Databases
  "PostgreSQL query optimization techniques",
  "MongoDB aggregation pipeline tutorial",
  "Redis caching patterns for web applications",
  "ElasticSearch full-text search setup",
  "MySQL indexing strategies for performance",
  "SQLite for mobile applications",
  "DynamoDB single-table design patterns",
  "Neo4j graph database fundamentals",
  "Cassandra distributed database architecture",
  "TimescaleDB for time-series data",

  // Programming Languages
  "TypeScript generics explained with examples",
  "Python async programming with asyncio",
  "Rust ownership and borrowing explained",
  "Go concurrency with goroutines and channels",
  "Java streams and functional programming",
  "Kotlin coroutines for Android development",
  "C++ smart pointers and memory management",
  "Ruby metaprogramming techniques",
  "Scala functional programming patterns",
  "Elixir OTP and fault tolerance",

  // Machine Learning & AI
  "Introduction to machine learning with scikit-learn",
  "PyTorch neural network training tutorial",
  "TensorFlow model deployment guide",
  "Hugging Face transformers fine-tuning",
  "LangChain for LLM applications",
  "Vector databases for semantic search",
  "RAG architecture implementation guide",
  "Prompt engineering best practices",
  "MLOps pipeline with MLflow",
  "Computer vision with OpenCV",

  // Mobile Development
  "React Native mobile app development",
  "Swift UI declarative interface building",
  "Flutter cross-platform development guide",
  "Android Jetpack Compose tutorial",
  "iOS Core Data persistence guide",
  "Mobile app performance optimization",
  "Push notifications implementation",
  "Mobile deep linking strategies",
  "App store optimization techniques",
  "Mobile security best practices",

  // Testing & Quality
  "Jest unit testing best practices",
  "Cypress end-to-end testing guide",
  "Pytest fixtures and parametrization",
  "Test-driven development workflow",
  "API testing with Postman",
  "Load testing with k6",
  "Mutation testing for code quality",
  "Contract testing with Pact",
  "Visual regression testing setup",
  "Code coverage analysis tools",

  // Tools & Build Systems
  "Webpack module bundling configuration",
  "Vite build tool migration guide",
  "Git branching strategies for large teams",
  "npm vs yarn vs pnpm comparison",
  "ESLint and Prettier configuration",
  "Monorepo management with Turborepo",
  "GitHub Copilot productivity tips",
  "VS Code extensions for developers",
  "Vim for modern development",
  "Terminal productivity with tmux",

  // Security
  "OAuth 2.0 authentication implementation",
  "JWT token security best practices",
  "SQL injection prevention techniques",
  "XSS attack prevention in React",
  "CORS configuration explained",
  "API rate limiting strategies",
  "Secrets management with Vault",
  "SSL/TLS certificate setup",
  "Web application firewall configuration",
  "Penetration testing methodology",

  // Architecture & Design
  "Microservices architecture patterns",
  "Event-driven architecture with Kafka",
  "Domain-driven design fundamentals",
  "Clean architecture implementation",
  "CQRS and event sourcing patterns",
  "API versioning strategies",
  "Database sharding techniques",
  "Caching strategies for scalability",
  "Load balancing algorithms",
  "Circuit breaker pattern implementation",

  // Data Engineering
  "Apache Spark data processing tutorial",
  "Airflow DAG orchestration guide",
  "dbt data transformation patterns",
  "Snowflake data warehouse setup",
  "Kafka streaming data pipelines",
  "Delta Lake for data lakes",
  "Pandas data manipulation guide",
  "SQL window functions explained",
  "ETL pipeline best practices",
  "Data quality monitoring tools",

  // Cloud & Networking
  "AWS VPC networking fundamentals",
  "Cloud cost optimization strategies",
  "Serverless vs containers comparison",
  "CDN configuration for static assets",
  "DNS configuration and management",
  "HTTP/2 and HTTP/3 differences",
  "gRPC service communication",
  "Service mesh with Istio",
  "Multi-cloud deployment strategies",
  "Edge computing architecture",

  // Specific Tools
  "Setting up Claude Code for your project",
  "Cursor AI editor configuration",
  "GitHub Actions workflow examples",
  "Vercel deployment configuration",
  "Supabase backend as a service",
  "PlanetScale database branching",
  "Prisma ORM schema design",
  "tRPC type-safe API development",
  "Zod schema validation patterns",
  "Tailwind CSS utility patterns",
];

// Combine and deduplicate
const allNonTech = [...new Set([...highConfNonTech, ...curatedNonTech])];
const allTech = [...new Set([...highConfTech, ...curatedTech])];

console.log(`\nFinal non-technical examples: ${allNonTech.length}`);
console.log(`Final technical examples: ${allTech.length}`);

// Create balanced test set (use min of both to balance)
const minSize = Math.min(allNonTech.length, allTech.length, 300);
const balancedNonTech = allNonTech.slice(0, minSize);
const balancedTech = allTech.slice(0, minSize);

const testData = {
  description: "Balanced test dataset for classifier FPR validation. FPR = false positives (non-tech classified as tech) / total non-tech.",
  maxFPR: 0.10,
  minRecall: 0.60,
  nonTechnical: allNonTech,
  technical: allTech,
  balancedTestSize: minSize,
};

fs.writeFileSync(testPath, JSON.stringify(testData, null, 2));
console.log(`\nSaved test dataset to: ${testPath}`);
console.log(`  Non-technical: ${allNonTech.length}`);
console.log(`  Technical: ${allTech.length}`);
console.log(`  Balanced test size: ${minSize} each`);
