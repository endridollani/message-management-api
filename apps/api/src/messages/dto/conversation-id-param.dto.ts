import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

import { ID_PATTERN, trimString } from './validation';

export class ConversationIdParamDto {
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(ID_PATTERN)
  conversationId!: string;
}
