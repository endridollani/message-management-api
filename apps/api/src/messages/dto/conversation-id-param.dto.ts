import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { ID_PATTERN, trimString } from './validation';

export class ConversationIdParamDto {
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
}
