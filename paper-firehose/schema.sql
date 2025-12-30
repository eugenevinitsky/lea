-- Papers discovered from the firehose
CREATE TABLE IF NOT EXISTS papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  normalized_id TEXT NOT NULL, -- e.g., arxiv:2401.12345, doi:10.1234/foo
  source TEXT NOT NULL, -- arxiv, doi, biorxiv, medrxiv, etc.
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  mention_count INTEGER DEFAULT 1,
  UNIQUE(normalized_id)
);

-- Posts that mention papers
CREATE TABLE IF NOT EXISTS paper_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id INTEGER NOT NULL,
  post_uri TEXT NOT NULL,
  author_did TEXT NOT NULL,
  author_handle TEXT,
  post_text TEXT,
  created_at TEXT NOT NULL,
  is_verified_researcher INTEGER DEFAULT 0,
  FOREIGN KEY (paper_id) REFERENCES papers(id),
  UNIQUE(paper_id, post_uri)
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_papers_source ON papers(source);
CREATE INDEX IF NOT EXISTS idx_papers_last_seen ON papers(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_papers_mention_count ON papers(mention_count DESC);
CREATE INDEX IF NOT EXISTS idx_mentions_paper ON paper_mentions(paper_id);
CREATE INDEX IF NOT EXISTS idx_mentions_author ON paper_mentions(author_did);
CREATE INDEX IF NOT EXISTS idx_mentions_created ON paper_mentions(created_at);
CREATE INDEX IF NOT EXISTS idx_mentions_verified ON paper_mentions(is_verified_researcher);
