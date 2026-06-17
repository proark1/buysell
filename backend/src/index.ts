import { buildApp } from './app.js';
import { env } from './config/env.js';
import { startAmazonPriceMonitorScheduler } from './services/amazonPriceMonitorScheduler.js';
import { startEbayDiscoveryScheduler } from './services/ebayDiscoveryScheduler.js';

const app = await buildApp();

startAmazonPriceMonitorScheduler(app);
startEbayDiscoveryScheduler(app);

await app.listen({ port: env.PORT, host: '0.0.0.0' });
