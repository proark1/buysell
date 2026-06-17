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

const modelMismatchScore = scoreAmazonMatch(
  { title: 'Acme Wireless Barcode Scanner Model X100 Black' },
  { asin: 'B000TEST3', title: 'Acme X200 Wireless Barcode Scanner Black', brand: 'Acme', model: 'X200', matchConfidence: 0 }
);

if (modelMismatchScore >= score) {
  throw new Error(`expected model mismatch score below exact model score, got ${modelMismatchScore} >= ${score}`);
}

const packMismatchScore = scoreAmazonMatch(
  { title: 'Acme X100 Wireless Barcode Scanner 2 Pack' },
  { asin: 'B000TEST4', title: 'Acme X100 Wireless Barcode Scanner', brand: 'Acme', model: 'X100', matchConfidence: 0 }
);

if (packMismatchScore >= score) {
  throw new Error(`expected pack uncertainty score below exact product score, got ${packMismatchScore} >= ${score}`);
}

console.log('matchScorer unit test passed');
