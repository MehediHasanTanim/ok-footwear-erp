import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';

/**
 * Validates that a route parameter is a valid UUID (v4).
 *
 * Usage: @Param('id', ParseUUIDPipe) id: string
 *
 * Uses class-validator's isUUID for consistency with DTO validation.
 */
@Injectable()
export class ParseUUIDPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isUUID(value, '4')) {
      throw new BadRequestException(`"${value}" is not a valid UUID`);
    }
    return value;
  }
}
