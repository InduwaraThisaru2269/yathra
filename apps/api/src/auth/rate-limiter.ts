import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window limiter for sign-in and email endpoints. Kept in memory, so limits are per API
 * instance; move to Redis when the API runs on more than one instance.
 */
@Injectable()
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  hit(key: string, max: number, windowMs: number) {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      this.sweep(now);
      return;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const minutes = Math.ceil((bucket.resetAt - now) / 60000);
      throw new HttpException(`Too many attempts. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  reset(key: string) {
    this.buckets.delete(key);
  }

  private sweep(now: number) {
    if (this.buckets.size < 10_000) return;
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}
