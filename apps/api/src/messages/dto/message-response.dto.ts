import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MessageResponseDto {
  @ApiProperty({ example: '64f2d8e7a088f5d3d879c001' })
  id!: string;

  @ApiProperty({ example: 'conversation-1' })
  conversationId!: string;

  @ApiProperty({ example: 'sender-1' })
  senderId!: string;

  @ApiProperty({ example: 'hello searchable world' })
  content!: string;

  @ApiProperty({ example: '2026-07-03T09:00:00.000Z', format: 'date-time' })
  timestamp!: string;

  @ApiPropertyOptional({
    additionalProperties: true,
    example: { channel: 'sms' },
    type: 'object',
  })
  metadata?: Record<string, unknown>;
}

export class ListMessagesPaginationDto {
  @ApiProperty({ example: 20, minimum: 1, maximum: 100 })
  limit!: number;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Opaque cursor for the next page, or null when there is no next page.',
  })
  nextCursor!: string | null;

  @ApiProperty({ example: false })
  hasMore!: boolean;

  @ApiProperty({ enum: ['asc', 'desc'], example: 'desc' })
  sortOrder!: 'asc' | 'desc';
}

export class ListMessagesResponseDto {
  @ApiProperty({ type: [MessageResponseDto] })
  data!: MessageResponseDto[];

  @ApiProperty({ type: ListMessagesPaginationDto })
  pagination!: ListMessagesPaginationDto;
}

export class SearchMessageResponseDto extends MessageResponseDto {
  @ApiProperty({ example: 1.25 })
  score!: number;
}

export class SearchMessagesPaginationDto {
  @ApiProperty({ example: 1, minimum: 1, maximum: 100 })
  page!: number;

  @ApiProperty({ example: 20, minimum: 1, maximum: 50 })
  limit!: number;

  @ApiProperty({ example: 1, minimum: 0 })
  total!: number;

  @ApiProperty({ example: 1, minimum: 0 })
  totalPages!: number;
}

export class SearchMessagesResponseDto {
  @ApiProperty({ type: [SearchMessageResponseDto] })
  data!: SearchMessageResponseDto[];

  @ApiProperty({ type: SearchMessagesPaginationDto })
  pagination!: SearchMessagesPaginationDto;
}
