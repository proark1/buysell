import { scoreAmazonMatch } from './matchScorer.js';
import { assertEqual } from './testHelpers.js';

const score = scoreAmazonMatch(
  { title: 'Acme Wireless Barcode Scanner Model X100 Black' },
  { asin: 'B000TEST', title: 'Acme X100 Wireless Barcode Scanner Black', brand: 'Acme', model: 'X100', matchConfidence: 0 }
);

if (score < 0.75) {
  throw new Error(`expected strong match score, got ${score}`);
}

const weakScore = scoreAmazonMatch(
  { title: 'Acme Wireless Barcode Scanner Model X100 Black' },
  { asin: 'B000TEST2', title: 'Kitchen Silicone Spatula Red', matchConfidence: 0 }
);

assertEqual(weakScore, 0, 'weak match score');

console.log('matchScorer unit test passed');
