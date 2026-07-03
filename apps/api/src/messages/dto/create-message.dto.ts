import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ID_PATTERN,
  IsPlainJsonObject,
  MaxJsonSize,
  MAX_METADATA_BYTES,
  trimString,
} from './validation';

export class CreateMessageDto {
  @ApiProperty({
    example: 'conversation-1',
    maxLength: 128,
    pattern: ID_PATTERN.source,
  })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(ID_PATTERN)
  conversationId!: string;

  @ApiProperty({
    example: 'sender-1',
    maxLength: 128,
    pattern: ID_PATTERN.source,
  })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(ID_PATTERN)
  senderId!: string;

  @ApiProperty({
    example: 'hello searchable world',
    maxLength: 5000,
  })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;

  @ApiPropertyOptional({
    additionalProperties: true,
    description: `Optional top-level JSON object, capped at ${MAX_METADATA_BYTES} serialized bytes.`,
    example: { channel: 'sms' },
    type: 'object',
  })
  @IsOptional()
  @IsPlainJsonObject()
  @MaxJsonSize(MAX_METADATA_BYTES)
  metadata?: Record<string, unknown>;
}
