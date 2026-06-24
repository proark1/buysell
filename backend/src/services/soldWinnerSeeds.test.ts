import {
  buildWinnerSignalIndexFromRows,
  parseSoldWinnerCsv,
  scoreWinnerSignalForText
} from './soldWinnerSeeds.js';
import { assertEqual } from './testHelpers.js';

const csv = `"Original-Daten zusammengefasst",,,,,,,,,,,,,,
,,,,,,,,,,,,,,
Date,Item ID,Item Name,Listing Type,Quantity Sold,Item Cost,Selling Price,eBay Fees,Shipping cost,Discount,Add Fee,Total Sale Amount,Net Profit,Order No.,Total Cost
,,TOTAL,,#REF!,#REF!,#REF!,#REF!,#REF!,#REF!,#REF!,#REF!,#REF!,#REF!,#REF!
05 Apr 2026,137114976928,beaphar Multi Vitamin Paste für Katzen 250g Ergänzungsfutter,Buy It Now,5,8.32,12.90,0.00,0.00,0.00,0.00,64.50,22.90,08-14463-58678,41.60
09 May 2026,137132800803,Pronto StaubXpress Nachfüller Staubfänger 1er Pack 5 Stück Reinigungszubehör,Buy It Now,3,4.84,11.88,0.00,0.00,0.00,0.00,35.64,21.12,06-14621-05924,14.52
25 Apr 2026,137132800803,Pronto StaubXpress Nachfüller Staubfänger 1er Pack 5 Stück Reinigungszubehör,Buy It Now,3,4.88,11.88,0.00,0.00,0.00,0.00,35.64,20.99,20-14536-35905,14.65`;

const rows = parseSoldWinnerCsv(csv, 'winners.csv');
assertEqual(rows.length, 3, 'sold winner parser skips preamble and total row');
assertEqual(rows[0].quantitySold, 5, 'sold winner quantity parsed');
assertEqual(rows[0].soldAt?.toISOString().slice(0, 10), '2026-04-05', 'sold winner date parsed');
assertEqual(rows[1].familyKey, rows[2].familyKey, 'repeated sold rows share one family key');

const index = buildWinnerSignalIndexFromRows(rows);
assertEqual(index.totalSeeds, 3, 'winner signal index keeps source row count');
assertEqual(index.signals.length, 2, 'winner signal index groups by family');

const exact = scoreWinnerSignalForText(
  rows[1].title,
  rows[1].familyKey,
  index
);
assertEqual(exact.matchType, 'FAMILY', 'winner signal exact family match');
assertEqual(exact.score > 10, true, 'winner signal exact family boost is material');

const similar = scoreWinnerSignalForText(
  'Pronto StaubXpress Staubfaenger Nachfueller Pack Reinigungszubehoer',
  undefined,
  index
);
assertEqual(similar.matchType, 'SIMILAR', 'winner signal similar title match');
assertEqual(similar.score > 0, true, 'winner signal similar title boost');

console.log('soldWinnerSeeds unit test passed');
