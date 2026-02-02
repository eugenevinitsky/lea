/**
 * Add bulk training examples to improve classifier
 */

import * as fs from 'fs';
import * as path from 'path';

interface TrainingExample {
  text: string;
  label: 'technical' | 'non-technical';
}

// FALSE POSITIVES TO FIX - add as non-technical
const nonTechExamples: string[] = [
  // War/Military history
  "158 Canadian soldiers who did not stay a little back of the front lines. A memorial to the fallen.",
  "The Battle of Normandy: How Allied Forces Changed History. D-Day and its lasting impact on Europe.",
  "Vietnam War Veterans Share Their Stories. Oral histories from those who served.",
  "World War II Pacific Theater: The Island Hopping Campaign. Military strategy and sacrifice.",
  "The Korean War: America's Forgotten Conflict. Veterans reflect on their service.",
  "Military History: The Evolution of Warfare from Ancient Times to Modern Day.",
  "Naval Battles That Changed History. From Trafalgar to Midway.",
  "Special Forces Operations: Declassified Missions from the Cold War.",

  // Real estate / Housing / Economics
  "NMHC on Apartments: Lower rent growth and higher vacancies in Q4. Leading indicator for housing.",
  "Housing Market Update: Prices Continue to Rise in Major Metro Areas. What buyers need to know.",
  "Commercial Real Estate Trends: Office Vacancy Rates Hit New Highs. The future of work impacts.",
  "Mortgage Rates Fall Below 6%: Is Now the Time to Buy? Expert analysis.",
  "Rental Market Report: Which Cities Have the Best Deals for Renters?",
  "Real Estate Investment Trusts: Are REITs a Good Investment in 2026?",
  "Home Prices vs Income: The Affordability Crisis Continues. Regional breakdown.",
  "Luxury Real Estate: Inside the Most Expensive Homes Sold This Year.",
  "Property Tax Assessments: How to Appeal Your Valuation. Step by step guide.",
  "First-Time Homebuyer Programs: State by State Guide to Down Payment Assistance.",

  // Nuclear energy (policy/business, not technical)
  "A final nuclear revival: My chat with nuclear energy advocate on policy. Podcast interview.",
  "Nuclear Power Plants: The Political Battle Over New Construction. State legislatures debate.",
  "Is Nuclear Energy the Answer to Climate Change? The policy debate continues.",
  "Nuclear Waste Storage: Communities Fight Against Proposed Sites. Local opposition grows.",
  "France's Nuclear Strategy: Lessons for America's Energy Future. Policy comparison.",

  // General business/CEO news (not tech-focused)
  "PwC's Global CEO Survey: Executives worry about economic uncertainty. Annual report findings.",
  "Fortune 500 CEO Compensation: Who Made the Most in 2025? Executive pay analysis.",
  "Corporate Layoffs Continue: Major Companies Announce Job Cuts. Economic headwinds.",
  "Earnings Season Recap: Winners and Losers from Q4 Reports. Market analysis.",
  "Supply Chain Disruptions: How Companies Are Adapting. Business strategy.",
  "ESG Investing: Are Companies Meeting Their Sustainability Goals? Annual review.",

  // Health/Disease news (non-technical)
  "Flu Season Update: CDC Reports Higher Than Normal Activity. Prevention tips.",
  "New Study Links Diet to Heart Disease Risk. Nutrition recommendations.",
  "Mental Health Crisis: Youth Depression Rates Continue to Climb. Expert perspectives.",
  "Healthcare Costs: Why Your Medical Bills Keep Rising. Policy explainer.",
  "Obesity Rates Hit New High: Public Health Officials Sound Alarm.",
  "Sleep Deprivation: The Hidden Epidemic Affecting Millions. Health impacts.",

  // Podcasts/interviews (non-technical unless about tech)
  "Interview with bestselling author on their new memoir. Life lessons learned.",
  "Podcast: Conversations with world leaders on global challenges.",
  "My chat with the CEO about leadership and company culture.",
  "Interview: Celebrity chef shares secrets from their new cookbook.",

  // Personal finance (non-technical)
  "Retirement Planning: How Much Do You Really Need to Save?",
  "Credit Card Rewards: Maximizing Your Points and Miles. Strategy guide.",
  "Tax Season Tips: Deductions You Might Be Missing. Expert advice.",
  "529 Plans: The Best Way to Save for College? Comparison guide.",
  "Budgeting Apps Compared: Which One Is Right for You?",

  // Travel/Lifestyle
  "Best European Cities to Visit in 2026. Travel guide and recommendations.",
  "Remote Work Destinations: Countries Offering Digital Nomad Visas.",
  "Restaurant Review: The Hottest New Spots in NYC. Dining guide.",
  "Wellness Retreats: Finding Balance in a Busy World. Self-care.",

  // Opinion/Commentary without technical substance
  "Why I Left Social Media and Never Looked Back. Personal essay.",
  "The Death of Civil Discourse: Can We Learn to Disagree Again?",
  "Parenting in the Digital Age: Setting Boundaries with Technology.",
  "Work-Life Balance Is a Myth: Here's What to Do Instead.",

  // Education (non-STEM)
  "Using the 5E Model to Teach Social Studies. Classroom framework.",
  "Project-Based Learning in the Humanities. Teaching strategies.",
  "How to Engage Students in History Class. Pedagogy tips.",
  "Writing Across the Curriculum: Best Practices for Teachers.",
];

// FALSE NEGATIVES TO FIX - add as technical
const techExamples: string[] = [
  // Intellectual/Philosophical Content (Maxim Raginsky - realizable.substack.com)
  "Hayek's Abstract Logic 9000 - The use of knowledge in Searle's Chinese Room",
  "Supertzar, or the Hand of Doom - The sleep of reason produces utility monsters. On superintelligence and AI.",
  "Games Without Frontiers - Hermann Weyl's dialectic of the infinite in the age of AI",
  "Horace P. Yuen (1946-2025) - A farewell to my PhD advisor. Information theory and quantum mechanics.",
  "The Sensory Order: Hayek's analysis of distributed knowledge in markets and the system counter-argument to Searle's Chinese room",
  "Information theory meets philosophy of mind: Embodied cognition and the limits of computation",
  "Why complexity theory matters for understanding intelligence: P vs NP and cognitive science",
  "Shannon's channel capacity and the nature of communication: From bits to meaning",
  "Control theory and homeostasis: Cybernetics, Wiener, and the origins of AI",
  "The mathematical foundations of learning theory: VC dimension and generalization",

  // Artificial Bureaucracy (Kevin Baker - computing history, philosophy of technology)
  "Context Widows - or, of GPUs, LPUs, and Goal Displacement. Can LLMs do science?",
  "Avoidance Machines - On bureaucracy, computing, and organizational behavior",
  "Crisis of Confidence - Avoidance Machines, Part 2. Technology and institutional failure",
  "The history of computing and bureaucratic rationality: From punch cards to neural networks",
  "Goal displacement in AI systems: When optimization metrics become the objective",
  "The organizational logic of large language models: Bureacracy and machine learning",
  "Computing history: The RAND Corporation and the origins of artificial intelligence",
  "Cybernetics and management science: The forgotten roots of AI",

  // argmin blog (Ben Recht - ML theory, statistics, academic research)
  "Thou Shalt Not Overfit - On the persistent inanity about overfitting in machine learning",
  "Too Much Information - What if we are writing too many papers? Academic publishing and ML research",
  "The Higgs Discovery Did Not Take Place - Philosophy of science and experimental physics",
  "An Outsider's Tour of Reinforcement Learning - Understanding RL from control theory",
  "The minimum description length principle and Occam's razor in machine learning",
  "Why optimization is not the same as learning: The difference between training and generalization",
  "Statistical learning theory: From PAC learning to modern deep learning",
  "The bitter lesson and the role of compute in AI progress: Historical perspective",
  "Causal inference and machine learning: Beyond correlation to understanding",
  "The reproducibility crisis in machine learning research: Benchmarks and best practices",

  // General philosophy of AI/CS theory
  "Gödel, Turing, and the limits of computation: What undecidability means for AI",
  "The Chinese Room argument revisited: Syntax, semantics, and understanding",
  "Embodied cognition and robotics: Why intelligence might require a body",
  "The frame problem in AI: Why common sense is computationally hard",
  "Algorithmic information theory: Kolmogorov complexity and learning",
  "The symbol grounding problem: How do words get their meaning?",
  "Connectionism vs symbolism: The great debate in cognitive science",
  "Philosophy of probability: Frequentist, Bayesian, and algorithmic interpretations",
  "Computational complexity and the nature of mathematical proof",
  "The alignment problem: Value learning and inverse reinforcement learning",

  // Claude/Anthropic
  "Claude Code and What Comes Next. With the right tools, AI can accomplish impressive things.",
  "First impressions of Claude Cowork, Anthropic's general agent. Testing the new AI assistant.",
  "Building with Claude API: Best Practices for Production Applications.",
  "Claude 3.5 Sonnet vs GPT-4: Benchmark Comparison for Coding Tasks.",
  "How to Use Claude for Code Review: Automated PR Analysis.",
  "Anthropic's Constitutional AI: How Claude Learns to Be Helpful and Harmless.",
  "Claude Artifacts: Building Interactive Components with AI.",
  "Using Claude for Data Analysis: From CSV to Insights.",

  // AI Agents/Workflows
  "Agent workflows: stop guessing, start measuring. Put data and AI to work.",
  "Building AI Agents with Tool Use and Function Calling. Autonomous systems.",
  "LangGraph: Building Stateful AI Agents with Cycles and Persistence.",
  "AutoGPT vs BabyAGI: Comparing Autonomous Agent Architectures.",
  "AI Agent Memory Systems: Vector Stores, Knowledge Graphs, and Beyond.",
  "Multi-Agent Systems: Coordinating Multiple LLMs for Complex Tasks.",
  "Agent Evaluation: How to Test and Benchmark Autonomous AI Systems.",
  "Building a Research Agent: Automating Literature Review with AI.",
  "AI Agents for Customer Support: Architecture and Best Practices.",
  "Tool-Calling in LLMs: Building Reliable Function Execution.",

  // Rust programming
  "Compile-Time Reflection Is Finally Here in Rust. New language features.",
  "Rust for Web Development: Actix, Axum, and Rocket Compared.",
  "Memory Safety in Rust: Understanding Ownership and Borrowing.",
  "Async Rust: Tokio vs async-std for Concurrent Programming.",
  "Writing a CLI Tool in Rust: From Cargo Init to Production.",
  "Rust Macros: Procedural and Declarative Macro Deep Dive.",
  "WebAssembly with Rust: Building High-Performance Web Apps.",
  "Error Handling in Rust: Result, Option, and Custom Error Types.",
  "Rust for Systems Programming: Building a Simple Operating System.",
  "Zero-Cost Abstractions in Rust: Performance Without Compromise.",

  // More LLM/AI Development
  "Generative AI's failure to induce robust models: Why LLMs struggle with reasoning.",
  "Fine-tuning Llama 3 on Custom Data: A Complete Guide.",
  "Quantization Explained: Running Large Models on Consumer Hardware.",
  "GGUF vs GPTQ: Comparing LLM Quantization Formats.",
  "Mixture of Experts: How Mixtral Achieves Efficiency at Scale.",
  "Constitutional AI: Training Language Models with Principles.",
  "RLHF vs DPO: Different Approaches to Aligning Language Models.",
  "Speculative Decoding: Faster LLM Inference with Draft Models.",
  "KV Cache Optimization: Reducing Memory Usage in Transformers.",
  "Flash Attention 2: Understanding the Algorithm Behind Faster Transformers.",

  // Python Development
  "Introduction to uv: The Best Python Package Manager. Faster than pip and poetry.",
  "Python Type Hints: A Complete Guide to Static Typing.",
  "FastAPI vs Django: Choosing the Right Python Web Framework.",
  "Asyncio Deep Dive: Concurrent Programming in Python.",
  "Pydantic V2: Data Validation for the Modern Python Developer.",
  "Python Profiling: Finding and Fixing Performance Bottlenecks.",
  "Poetry vs PDM vs uv: Python Dependency Management Compared.",
  "Building Python Packages: From Setup.py to Pyproject.toml.",

  // Database/Backend
  "PostgreSQL Performance Tuning: Query Optimization Strategies.",
  "The Kernel Contract: Why Logical Decoding Defined Core PostgreSQL Physics.",
  "Redis Streams: Building Real-Time Data Pipelines.",
  "SQLite in Production: When and Why It Makes Sense.",
  "Database Indexing Strategies: B-Trees, Hash Indexes, and GIN.",
  "Postgres vs MySQL: A Technical Comparison for 2026.",
  "Vector Databases Explained: Pinecone, Weaviate, Qdrant, Chroma.",
  "Time-Series Databases: InfluxDB, TimescaleDB, and QuestDB.",

  // DevOps/Infrastructure
  "Kubernetes Operators: Automating Complex Application Management.",
  "GitOps with ArgoCD: Declarative Infrastructure Deployment.",
  "Terraform vs Pulumi: Infrastructure as Code Compared.",
  "Service Mesh Deep Dive: Istio, Linkerd, and Consul Connect.",
  "Observability Stack: Prometheus, Grafana, and OpenTelemetry.",
  "Container Security: Scanning, Signing, and Runtime Protection.",
  "CI/CD Pipeline Optimization: Faster Builds and Deployments.",
  "Kubernetes Cost Optimization: Right-sizing and Autoscaling.",

  // Web Development
  "Next.js 14 Server Components: A Deep Dive into the App Router.",
  "React Server Components: How They Work Under the Hood.",
  "Astro vs Next.js: Choosing the Right Meta-Framework.",
  "HTMX: Building Dynamic UIs Without JavaScript Frameworks.",
  "Tailwind CSS v4: What's New and Migration Guide.",
  "Web Components in 2026: Using Custom Elements in Production.",
  "Progressive Web Apps: Service Workers and Offline-First Design.",
  "Edge Computing with Cloudflare Workers and Deno Deploy.",

  // Security
  "OAuth 2.0 and OIDC: Implementing Secure Authentication.",
  "API Security: Rate Limiting, Authentication, and Input Validation.",
  "Zero Trust Architecture: Principles and Implementation.",
  "Secrets Management: HashiCorp Vault vs AWS Secrets Manager.",
  "Web Application Firewalls: Protecting Against OWASP Top 10.",
  "Supply Chain Security: Signing and Verifying Software Artifacts.",

  // Data Science/ML (non-LLM)
  "XGBoost vs LightGBM: Gradient Boosting Showdown.",
  "Feature Engineering for Machine Learning: Best Practices.",
  "MLOps: Building Production ML Pipelines with MLflow.",
  "Time Series Forecasting: Prophet, ARIMA, and Neural Networks.",
  "A/B Testing at Scale: Statistical Methods and Pitfalls.",
  "Causal Inference in Data Science: Beyond Correlation.",

  // Systems/Low-Level
  "Understanding CPU Caches: L1, L2, L3 and Memory Hierarchy.",
  "Lock-Free Data Structures: Implementing Concurrent Algorithms.",
  "Linux Kernel Internals: Process Scheduling and Memory Management.",
  "SIMD Programming: Vectorizing Code for Performance.",
  "Profiling and Optimizing C++ Applications.",
  "Understanding the Linux Network Stack: From Socket to NIC.",

  // Distributed Systems
  "Consensus Algorithms: Raft, Paxos, and Practical BFT.",
  "Event Sourcing and CQRS: Building Scalable Systems.",
  "Distributed Tracing: Jaeger, Zipkin, and OpenTelemetry.",
  "CAP Theorem in Practice: Choosing Consistency Models.",
  "Message Queues: Kafka vs RabbitMQ vs Amazon SQS.",
  "Microservices Communication: gRPC, REST, and GraphQL.",
];

const inputPath = path.join(__dirname, '../data/training-data.json');
const outputPath = path.join(__dirname, '../data/training-data.json');

const data: TrainingExample[] = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

console.log(`Current training data: ${data.length} examples`);

let addedNonTech = 0;
let addedTech = 0;

for (const text of nonTechExamples) {
  data.push({ text, label: 'non-technical' });
  addedNonTech++;
}

for (const text of techExamples) {
  data.push({ text, label: 'technical' });
  addedTech++;
}

console.log(`Added ${addedNonTech} non-technical examples`);
console.log(`Added ${addedTech} technical examples`);
console.log(`New total: ${data.length} examples`);

const techCount = data.filter(e => e.label === 'technical').length;
const nonTechCount = data.filter(e => e.label === 'non-technical').length;
console.log(`Technical: ${techCount} (${(techCount/data.length*100).toFixed(1)}%)`);
console.log(`Non-technical: ${nonTechCount} (${(nonTechCount/data.length*100).toFixed(1)}%)`);

fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
console.log(`\nSaved to: ${outputPath}`);
