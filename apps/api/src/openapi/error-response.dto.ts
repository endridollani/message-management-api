import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: ['content should not be empty'],
  })
  message!: string | string[];

  @ApiProperty({ example: '/api/messages' })
  path!: string;

  @ApiProperty({ example: '2026-07-03T09:00:00.000Z', format: 'date-time' })
  timestamp!: string;

  @ApiProperty({ example: 'example-create-1' })
  correlationId!: string;
}
