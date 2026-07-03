import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { ID_PATTERN, IsPlainJsonObject, MaxJsonSize, MAX_METADATA_BYTES, trimString } from './validation';

export class CreateMessageDto {
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(ID_PATTERN)
  conversationId!: string;

  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(ID_PATTERN)
  senderId!: string;

  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;

  @IsOptional()
  @IsPlainJsonObject()
  @MaxJsonSize(MAX_METADATA_BYTES)
  metadata?: Record<string, unknown>;
}
