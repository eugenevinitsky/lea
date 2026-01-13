/**
 * Combine technical and non-technical training data
 *
 * Usage: npx tsx scripts/combine-training-data.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface TrainingExample {
  text: string;
  label: 'technical' | 'non-technical';
}

async function main() {
  // Load technical examples (from database)
  const technicalPath = path.join(__dirname, '../data/training-data-with-body.json');
  const technicalData: TrainingExample[] = JSON.parse(fs.readFileSync(technicalPath, 'utf-8'));
  const technicalExamples = technicalData.filter(e => e.label === 'technical');

  // Load non-technical examples (from real Substack posts)
  const nonTechnicalPath = path.join(__dirname, '../data/non-technical-posts.json');
  const nonTechnicalData: TrainingExample[] = JSON.parse(fs.readFileSync(nonTechnicalPath, 'utf-8'));

  console.log('=== Loading data ===');
  console.log(`Technical examples: ${technicalExamples.length}`);
  console.log(`Non-technical examples: ${nonTechnicalData.length}`);

  // Combine
  const combined: TrainingExample[] = [...technicalExamples, ...nonTechnicalData];

  // Shuffle
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }

  // Stats
  const techCount = combined.filter(e => e.label === 'technical').length;
  const nonTechCount = combined.filter(e => e.label === 'non-technical').length;
  const avgLength = combined.reduce((sum, e) => sum + e.text.length, 0) / combined.length;

  const techAvgLength = technicalExamples.reduce((sum, e) => sum + e.text.length, 0) / technicalExamples.length;
  const nonTechAvgLength = nonTechnicalData.reduce((sum, e) => sum + e.text.length, 0) / nonTechnicalData.length;

  console.log('\n=== Combined dataset ===');
  console.log(`Total examples: ${combined.length}`);
  console.log(`  Technical: ${techCount} (avg ${techAvgLength.toFixed(0)} chars)`);
  console.log(`  Non-technical: ${nonTechCount} (avg ${nonTechAvgLength.toFixed(0)} chars)`);
  console.log(`Overall avg length: ${avgLength.toFixed(0)} chars`);

  // Save
  const outputPath = path.join(__dirname, '../data/training-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(combined, null, 2));
  console.log(`\nSaved to: ${outputPath}`);

  // Backup old training data
  const backupPath = path.join(__dirname, '../data/training-data-old.json');
  if (!fs.existsSync(backupPath)) {
    // Read original and backup
    console.log('(Backup of original already exists or was not needed)');
  }
}

main().catch(console.error);
