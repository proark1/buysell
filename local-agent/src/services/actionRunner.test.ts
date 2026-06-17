import { describeAction } from './actionRunner.js';
import { assertEqual, assertIncludes } from './testHelpers.js';

const buyDescription = describeAction({
  id: 'action-1',
  type: 'BUY',
  status: 'APPROVED',
  reason: 'Order is ready for purchase review.',
  orderId: 'order-1'
});

assertIncludes(buyDescription, 'Amazon checkout', 'BUY action description');
assertIncludes(buyDescription, 'order order-1', 'BUY action order reference');

const listDescription = describeAction({
  id: 'action-2',
  type: 'LIST',
  status: 'APPROVED',
  reason: 'Candidate passed listing rules.'
});

assertIncludes(listDescription, 'eBay listing review', 'LIST action description');

const verifyDescription = describeAction({
  id: 'action-verify',
  type: 'VERIFY',
  status: 'APPROVED',
  reason: 'Live check required.',
  payloadJson: {
    expectedAmazonUrl: 'https://www.amazon.de/dp/B000SCAN',
    expectedEbayUrl: 'https://www.ebay.de/itm/123'
  }
});

assertIncludes(verifyDescription, 'live browser verification', 'VERIFY action description');
assertIncludes(verifyDescription, 'https://www.amazon.de/dp/B000SCAN', 'VERIFY action Amazon URL');

const reviewDescription = describeAction({
  id: 'action-3',
  type: 'REVIEW',
  status: 'APPROVED',
  reason: 'Needs operator review.'
});

assertEqual(reviewDescription, 'Open manual review for approved action action-3: Needs operator review.', 'REVIEW action description');

console.log('local-agent actionRunner unit test passed');
