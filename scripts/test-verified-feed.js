#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

const { AtpAgent } = require('@atproto/api');

const LEA_LABELER_DID = 'did:plc:7c7tx56n64jhzezlwox5dja6';

async function main() {
  const handle = process.env.LABELER_HANDLE;
  const password = process.env.LABELER_PASSWORD;

  if (!handle || !password) {
    console.error('Need LABELER_HANDLE and LABELER_PASSWORD in .env.local');
    process.exit(1);
  }

  const agent = new AtpAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier: handle, password });
  
  // Configure labeler to see verified labels
  agent.configureLabelersHeader([LEA_LABELER_DID]);

  console.log(`Logged in as: ${agent.session?.handle}\n`);

  // Get timeline
  const timeline = await agent.getTimeline({ limit: 50 });
  
  console.log(`Got ${timeline.data.feed.length} posts from timeline\n`);
  console.log('='.repeat(60));
  
  for (const item of timeline.data.feed) {
    const author = item.post.author;
    const labels = author.labels || [];
    const isVerified = labels.some(l => l.val === 'verified-researcher' && l.src === LEA_LABELER_DID);
    const following = author.viewer?.following;
    
    if (isVerified) {
      console.log(`\n@${author.handle}`);
      console.log(`  Verified: YES`);
      console.log(`  Following: ${following ? 'YES' : 'NO'}`);
      console.log(`  viewer object: ${JSON.stringify(author.viewer)}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\nChecking carlbergstrom.com specifically...\n');
  
  // Search for carlbergstrom in timeline
  for (const item of timeline.data.feed) {
    if (item.post.author.handle === 'carlbergstrom.com') {
      const author = item.post.author;
      console.log('Found carlbergstrom.com in timeline!');
      console.log(`  viewer: ${JSON.stringify(author.viewer)}`);
      console.log(`  labels: ${JSON.stringify(author.labels)}`);
      console.log(`  reason (repost?): ${JSON.stringify(item.reason)}`);
    }
  }
}

main().catch(console.error);
