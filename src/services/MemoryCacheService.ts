interface CacheItem<T> {
    data: T;
    timestamp: number;
}

class MemoryCacheService {
    private cache: Map<string, CacheItem<any>> = new Map();
    private readonly CACHE_DURATION = 30 * 60 * 1000; // 30分钟

    set<T>(key: string, data: T): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    get<T>(key: string): T | null {
        const item = this.cache.get(key);

        if (!item) return null;

        // 检查是否过期
        if (Date.now() - item.timestamp > this.CACHE_DURATION) {
            this.cache.delete(key);
            return null;
        }

        return item.data;
    }

    clear(): void {
        this.cache.clear();
    }
}

export const cacheService = new MemoryCacheService();
