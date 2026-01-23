/**
 * PostgreSQL Storage Provider
 * Persistent storage with TypeORM and optional Redis caching.
 */

import 'reflect-metadata';
import { DataSource, Repository, LessThan } from 'typeorm';
import { createClient, RedisClientType } from 'redis';
import type {
  StorageProvider,
  StorageProviderConfig,
  ConversationContext,
} from '../types';
import { SessionEntity, MessageEntity } from '../entities';
import type { LLMMessage } from '../../providers/types';

export class PostgresStorageProvider implements StorageProvider {
  readonly name = 'postgres' as const;

  private dataSource: DataSource | null = null;
  private sessionRepository: Repository<SessionEntity> | null = null;
  private messageRepository: Repository<MessageEntity> | null = null;
  private redis: RedisClientType | null = null;

  private readonly config: Required<
    Pick<
      StorageProviderConfig,
      'postgresHost' | 'postgresPort' | 'postgresDatabase' | 'postgresUser' | 'postgresPassword'
    >
  > & Pick<StorageProviderConfig, 'redisHost' | 'redisPort' | 'redisPassword'> & {
    sessionExpirationDays: number;
    maxHistoryMessages: number;
  };

  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CACHE_TTL_SECONDS = 300; // 5 minutes cache

  constructor(config?: StorageProviderConfig) {
    this.config = {
      postgresHost: config?.postgresHost ?? process.env.POSTGRES_HOST ?? 'localhost',
      postgresPort: config?.postgresPort ?? parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
      postgresDatabase: config?.postgresDatabase ?? process.env.POSTGRES_DATABASE ?? 'concieragent',
      postgresUser: config?.postgresUser ?? process.env.POSTGRES_USER ?? 'concieragent',
      postgresPassword: config?.postgresPassword ?? process.env.POSTGRES_PASSWORD ?? '',
      redisHost: config?.redisHost ?? process.env.REDIS_HOST,
      redisPort: config?.redisPort ?? parseInt(process.env.REDIS_PORT ?? '6379', 10),
      redisPassword: config?.redisPassword ?? process.env.REDIS_PASSWORD,
      sessionExpirationDays: config?.sessionExpirationDays ?? parseInt(process.env.SESSION_EXPIRATION_DAYS ?? '7', 10),
      maxHistoryMessages: config?.maxHistoryMessages ?? 20,
    };
  }

  async initialize(): Promise<void> {
    console.log('🗄️ Initializing PostgreSQL storage...');

    // Initialize TypeORM DataSource
    this.dataSource = new DataSource({
      type: 'postgres',
      host: this.config.postgresHost,
      port: this.config.postgresPort,
      database: this.config.postgresDatabase,
      username: this.config.postgresUser,
      password: this.config.postgresPassword,
      entities: [SessionEntity, MessageEntity],
      synchronize: true, // Auto-create tables (use migrations in production)
      logging: process.env.NODE_ENV === 'development',
    });

    await this.dataSource.initialize();
    console.log(`✅ PostgreSQL connected to ${this.config.postgresHost}:${this.config.postgresPort}/${this.config.postgresDatabase}`);

    this.sessionRepository = this.dataSource.getRepository(SessionEntity);
    this.messageRepository = this.dataSource.getRepository(MessageEntity);

    // Initialize Redis if configured
    if (this.config.redisHost) {
      await this.initializeRedis();
    }

    // Start cleanup interval (every hour)
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions().catch(console.error);
    }, 60 * 60 * 1000);

    console.log('🗄️ PostgreSQL storage initialized');
  }

  private async initializeRedis(): Promise<void> {
    try {
      const redisUrl = this.config.redisPassword
        ? `redis://:${this.config.redisPassword}@${this.config.redisHost}:${this.config.redisPort}`
        : `redis://${this.config.redisHost}:${this.config.redisPort}`;

      this.redis = createClient({ url: redisUrl });

      this.redis.on('error', (err) => {
        console.error('❌ Redis error:', err);
      });

      await this.redis.connect();
      console.log(`✅ Redis connected to ${this.config.redisHost}:${this.config.redisPort}`);
    } catch (error) {
      console.warn('⚠️ Redis connection failed, continuing without cache:', error);
      this.redis = null;
    }
  }

  async getOrCreateContext(connectionId: string): Promise<ConversationContext> {
    // Try cache first
    const cached = await this.getCachedContext(connectionId);
    if (cached) {
      return cached;
    }

    // Load from database
    const session = await this.sessionRepository!.findOne({
      where: { connectionId },
      relations: ['messages'],
      order: { messages: { sequenceNumber: 'ASC' } },
    });

    if (session && session.expiresAt > new Date()) {
      const context = this.sessionToContext(session);
      await this.cacheContext(connectionId, context);
      return context;
    }

    // Create new session
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.sessionExpirationDays * 24 * 60 * 60 * 1000);

    const newSession = this.sessionRepository!.create({
      connectionId,
      extractedInfo: {},
      expiresAt,
    });

    await this.sessionRepository!.save(newSession);

    const context: ConversationContext = {
      messages: [],
      extractedInfo: {},
      lastUpdated: now.getTime(),
    };

    await this.cacheContext(connectionId, context);
    return context;
  }

  async saveContext(connectionId: string, context: ConversationContext): Promise<void> {
    const session = await this.sessionRepository!.findOne({
      where: { connectionId },
    });

    if (!session) {
      console.error(`❌ Session not found for connection ${connectionId}`);
      return;
    }

    // Update session metadata
    session.extractedInfo = context.extractedInfo;
    session.expiresAt = new Date(Date.now() + this.config.sessionExpirationDays * 24 * 60 * 60 * 1000);
    await this.sessionRepository!.save(session);

    // Get the highest sequence number in DB for this session
    const maxSeqResult = await this.messageRepository!
      .createQueryBuilder('msg')
      .select('MAX(msg.sequenceNumber)', 'maxSeq')
      .where('msg.session = :sessionId', { sessionId: session.id })
      .getRawOne();

    const existingMaxSeq = maxSeqResult?.maxSeq ?? -1;
    const existingCount = existingMaxSeq + 1;

    // Only save new messages (those beyond existing count)
    const newMessages = context.messages.slice(existingCount);

    if (newMessages.length > 0) {
      const messageEntities = newMessages.map((msg, index) => {
        const entity = this.messageRepository!.create({
          role: msg.role,
          content: msg.content,
          toolCallId: msg.toolCallId,
          toolCalls: msg.toolCalls,
          sequenceNumber: existingCount + index,
          session: session,
        });
        return entity;
      });

      await this.messageRepository!.save(messageEntities);
    }

    // Prune old messages if exceeding limit
    const totalMessages = existingCount + newMessages.length;
    if (totalMessages > this.config.maxHistoryMessages * 2) {
      const deleteCount = totalMessages - this.config.maxHistoryMessages;
      // Find oldest messages to delete
      const messagesToDelete = await this.messageRepository!.find({
        where: { sessionId: session.id },
        order: { sequenceNumber: 'ASC' },
        take: deleteCount,
        select: ['id'],
      });

      if (messagesToDelete.length > 0) {
        const idsToDelete = messagesToDelete.map((m) => m.id);
        await this.messageRepository!.delete(idsToDelete);
      }
    }

    await this.sessionRepository!.save(session);

    // Update cache
    context.lastUpdated = Date.now();
    await this.cacheContext(connectionId, context);
  }

  async clearContext(connectionId: string): Promise<void> {
    await this.sessionRepository!.delete({ connectionId });
    await this.invalidateCache(connectionId);
    console.log(`🧹 Cleared context for connection ${connectionId}`);
  }

  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.sessionRepository!.delete({
      expiresAt: LessThan(new Date()),
    });

    const deleted = result.affected ?? 0;
    if (deleted > 0) {
      console.log(`🧹 Cleaned up ${deleted} expired sessions`);
    }

    return deleted;
  }

  isConfigured(): boolean {
    return !!(
      this.config.postgresHost &&
      this.config.postgresDatabase &&
      this.config.postgresUser
    );
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }

    if (this.dataSource) {
      await this.dataSource.destroy();
      this.dataSource = null;
    }

    console.log('🗄️ PostgreSQL storage closed');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helper methods
  // ─────────────────────────────────────────────────────────────────────────────

  private sessionToContext(session: SessionEntity): ConversationContext {
    const messages: LLMMessage[] = (session.messages ?? []).map((msg) => ({
      role: msg.role,
      content: msg.content,
      toolCallId: msg.toolCallId,
      toolCalls: msg.toolCalls,
    }));

    return {
      messages,
      extractedInfo: session.extractedInfo,
      lastUpdated: session.lastUpdated.getTime(),
    };
  }

  private cacheKey(connectionId: string): string {
    return `concieragent:context:${connectionId}`;
  }

  private async getCachedContext(connectionId: string): Promise<ConversationContext | null> {
    if (!this.redis) return null;

    try {
      const cached = await this.redis.get(this.cacheKey(connectionId));
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('⚠️ Redis cache read failed:', error);
    }

    return null;
  }

  private async cacheContext(connectionId: string, context: ConversationContext): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.setEx(
        this.cacheKey(connectionId),
        this.CACHE_TTL_SECONDS,
        JSON.stringify(context)
      );
    } catch (error) {
      console.warn('⚠️ Redis cache write failed:', error);
    }
  }

  private async invalidateCache(connectionId: string): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.del(this.cacheKey(connectionId));
    } catch (error) {
      console.warn('⚠️ Redis cache invalidation failed:', error);
    }
  }
}
