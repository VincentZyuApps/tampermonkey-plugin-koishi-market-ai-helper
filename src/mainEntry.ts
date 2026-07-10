import { KoishiMarketAiHelper, shouldRun } from './app/appCore';

if (shouldRun()) {
  new KoishiMarketAiHelper().start();
}
