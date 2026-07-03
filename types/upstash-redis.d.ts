declare module '@upstash/redis' {
  export class Redis {
    constructor(options: { url: string; token: string });
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown, options?: { ex?: number }): Promise<unknown>;
    del(...keys: string[]): Promise<number>;
    sadd(key: string, ...members: string[]): Promise<number>;
    smembers(key: string): Promise<string[]>;
    expire(key: string, seconds: number): Promise<number>;
    scan(cursor: number, options: { match?: string; count?: number }): Promise<[number, string[]]>;
  }
}
