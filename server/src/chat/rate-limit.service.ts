import { Injectable } from '@nestjs/common';

interface RateLimitEntry {
  timestamps: number[];
  mutedUntil: number | null;
}

export interface RateLimitResult {
  allowed: boolean;
  mutedUntil?: Date;
  remainingMessages?: number;
  error?: string;
}

@Injectable()
export class RateLimitService {
  // Configuration
  private readonly windowMs = 10 * 1000; // 10 seconds
  private readonly maxMessages = 5; // 5 messages per window
  private readonly muteDurationMs = 30 * 1000; // 30 seconds mute

  // In-memory store: Map<userId:roomId, RateLimitEntry>
  private rateLimitMap = new Map<string, RateLimitEntry>();

  // Cleanup interval (every minute)
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Periodic cleanup of old entries
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Check if a message is allowed and record it if so
   */
  checkAndRecord(userId: string, roomId: string): RateLimitResult {
    const key = `${userId}:${roomId}`;
    const now = Date.now();

    let entry = this.rateLimitMap.get(key);
    if (!entry) {
      entry = { timestamps: [], mutedUntil: null };
      this.rateLimitMap.set(key, entry);
    }

    // Check if currently muted
    if (entry.mutedUntil && now < entry.mutedUntil) {
      return {
        allowed: false,
        mutedUntil: new Date(entry.mutedUntil),
        error: 'You are muted due to rate limit violation',
      };
    }

    // Clear mute if expired
    if (entry.mutedUntil && now >= entry.mutedUntil) {
      entry.mutedUntil = null;
      entry.timestamps = [];
    }

    // Filter timestamps to current window
    const windowStart = now - this.windowMs;
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    // Check if limit exceeded
    if (entry.timestamps.length >= this.maxMessages) {
      // Apply mute
      entry.mutedUntil = now + this.muteDurationMs;
      return {
        allowed: false,
        mutedUntil: new Date(entry.mutedUntil),
        error: 'Rate limit exceeded. You are muted for 30 seconds.',
      };
    }

    // Record this message
    entry.timestamps.push(now);
    const remaining = this.maxMessages - entry.timestamps.length;

    return {
      allowed: true,
      remainingMessages: remaining,
    };
  }

  /**
   * Check rate limit status without recording
   */
  getStatus(userId: string, roomId: string): RateLimitResult {
    const key = `${userId}:${roomId}`;
    const now = Date.now();

    const entry = this.rateLimitMap.get(key);
    if (!entry) {
      return { allowed: true, remainingMessages: this.maxMessages };
    }

    // Check if currently muted
    if (entry.mutedUntil && now < entry.mutedUntil) {
      return {
        allowed: false,
        mutedUntil: new Date(entry.mutedUntil),
      };
    }

    // Filter timestamps to current window
    const windowStart = now - this.windowMs;
    const validTimestamps = entry.timestamps.filter((t) => t > windowStart);
    const remaining = this.maxMessages - validTimestamps.length;

    return {
      allowed: remaining > 0,
      remainingMessages: Math.max(0, remaining),
    };
  }

  /**
   * Clean up old entries to prevent memory leaks
   */
  private cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [key, entry] of this.rateLimitMap.entries()) {
      // Remove entries with no recent timestamps and no active mute
      const hasRecentTimestamps = entry.timestamps.some((t) => t > windowStart);
      const hasActiveMute = entry.mutedUntil && entry.mutedUntil > now;

      if (!hasRecentTimestamps && !hasActiveMute) {
        this.rateLimitMap.delete(key);
      }
    }
  }
}
