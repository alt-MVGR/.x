export class ApiRouter {
    constructor() {
        this.keyStats = new Map();
    }

    _initKey(key) {
        if (!this.keyStats.has(key)) {
            this.keyStats.set(key, { timestamps: [], cooldownUntil: 0 });
        }
    }

    getBestKey(apiKeys) {
        if (!apiKeys || apiKeys.length === 0) return null;
        if (apiKeys.length === 1) return apiKeys[0];

        const now = Date.now();
        let bestKey = null;
        let minUsage = Infinity;

        // Shuffle keys to distribute traffic randomly among tied keys
        const shuffled = [...apiKeys].sort(() => Math.random() - 0.5);

        for (const key of shuffled) {
            this._initKey(key);
            const stats = this.keyStats.get(key);

            // Skip if currently in cooldown
            if (now < stats.cooldownUntil) continue;

            // Clean timestamps older than 60 seconds
            stats.timestamps = stats.timestamps.filter(t => now - t < 60000);

            if (stats.timestamps.length < minUsage) {
                minUsage = stats.timestamps.length;
                bestKey = key;
            }
        }

        // Fallback: If ALL keys are in cooldown, return a random key.
        // The API will reject it with a 429, and the retry logic will handle the hard thread sleep.
        if (!bestKey) {
            return apiKeys[Math.floor(Math.random() * apiKeys.length)];
        }

        return bestKey;
    }

    logUsage(key) {
        if (!key) return;
        this._initKey(key);
        this.keyStats.get(key).timestamps.push(Date.now());
    }

    setCooldown(key, retryAfterSeconds) {
        if (!key) return;
        this._initKey(key);
        let delayMs = 60000; // Default 1 minute cooldown if unspecified
        
        if (retryAfterSeconds) {
            const parsedSeconds = parseInt(retryAfterSeconds, 10);
            if (!isNaN(parsedSeconds)) {
                delayMs = parsedSeconds * 1000;
            } else {
                const dateMs = new Date(retryAfterSeconds).getTime();
                if (!isNaN(dateMs)) {
                    delayMs = Math.max(1000, dateMs - Date.now());
                }
            }
        }
        
        this.keyStats.get(key).cooldownUntil = Date.now() + delayMs;
    }
}

export const globalApiRouter = new ApiRouter();
