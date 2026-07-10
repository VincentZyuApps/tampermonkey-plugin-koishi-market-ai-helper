import { MARKET_REGISTRY_URL } from '../app/appConstants';
import { gmJson } from '../platform/gmBridge';
import type { AppState, RegistryData } from '../types/appTypes';
import type { Logger } from '../log/appLogger';

export function loadRegistry(state: AppState, logger: Logger): Promise<RegistryData> {
  if (state.registry) return Promise.resolve(state.registry);
  if (!state.registryPromise) {
    logger.write('info', '开始加载 Koishi registry', { url: MARKET_REGISTRY_URL });
    state.registryPromise = gmJson<RegistryData>(
      MARKET_REGISTRY_URL,
      {},
      (level, message, detail) => logger.write(level, message, detail),
    ).then((data) => {
      if (!data || !Array.isArray(data.objects)) {
        throw new Error('registry 数据格式不正确');
      }
      state.registry = data;
      logger.write('info', 'Koishi registry 加载完成', {
        version: data.version,
        total: data.total,
        objects: data.objects.length,
        time: data.time,
      });
      return data;
    }).finally(() => {
      state.registryPromise = null;
    });
  }
  return state.registryPromise;
}
