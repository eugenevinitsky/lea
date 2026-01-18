import { classifyContent } from '../lib/substack-classifier';
import model from '../lib/classifier-model.json';

const weights = model.weights as Record<string, number>;

function debugClassification(text: string) {
  console.log('='.repeat(60));
  console.log('Text:', text);
  const result = classifyContent(text);
  console.log('Probability:', result.probability?.toFixed(4));
  console.log('Tokens:', result.tokens.join(', '));

  const contribs: { token: string; weight: number }[] = [];
  for (const t of result.tokens) {
    if (weights[t] !== undefined) {
      contribs.push({ token: t, weight: weights[t] });
    } else {
      contribs.push({ token: t, weight: 0 });
    }
  }
  contribs.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  console.log('\nToken contributions:');
  for (const c of contribs.slice(0, 15)) {
    const sign = c.weight >= 0 ? '+' : '';
    const inVocab = weights[c.token] !== undefined ? '' : ' [NOT IN VOCAB]';
    console.log(`  ${c.token}: ${sign}${c.weight.toFixed(3)}${inVocab}`);
  }
  console.log('');
}

debugClassification("The Sovereign Architect: NVIDIA's Leap to the Physical AI World");
debugClassification("TSMC beats, AI chip boom ignites");
debugClassification("Machine Learning Optimization Algorithms");
debugClassification("Deep Learning for Computer Vision");
