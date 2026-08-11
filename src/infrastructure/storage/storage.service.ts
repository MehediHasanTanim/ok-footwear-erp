/**
 * Minimal object storage for GRN QC photos.
 * Writes to a local uploads directory (S3-compatible key layout) when AWS
 * credentials are empty — suitable for local/MinIO-bound development.
 */
import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { AppConfigService } from '@shared/config/app-config.service';

export interface StoredObject {
  s3Key: string;
  contentType: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly appConfig: AppConfigService) {}

  async putObject(
    keyPrefix: string,
    filename: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<StoredObject> {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `${keyPrefix.replace(/\/$/, '')}/${randomUUID()}-${safeName}`;
    const baseDir = path.resolve(this.appConfig.procurement.localUploadDir);
    const fullPath = path.join(baseDir, s3Key);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);

    this.logger.debug({
      message: 'Stored object locally (dev/MinIO fallback path)',
      s3Key,
      bucket: this.appConfig.s3Bucket,
    });

    return { s3Key, contentType };
  }
}
