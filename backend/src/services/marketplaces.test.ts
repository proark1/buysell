import { resolveEbayComparisonSettings } from './marketplaces.js';
import { assertEqual } from './testHelpers.js';

const settings = resolveEbayComparisonSettings({
  presetKey: 'balanced',
  soldOnly: false,
  completedOnly: false,
  buyingFormat: 'ANY',
  itemCondition: 'USED',
  preferredLocation: 'Worldwide'
});

assertEqual(settings.soldOnly, false, 'comparison settings soldOnly override');
assertEqual(settings.completedOnly, false, 'comparison settings completedOnly override');
assertEqual(settings.buyingFormat, 'ANY', 'comparison settings buyingFormat override');
assertEqual(settings.itemCondition, 'USED', 'comparison settings itemCondition override');
assertEqual(settings.preferredLocation, 'Worldwide', 'comparison settings location override');

console.log('marketplaces unit test passed');
