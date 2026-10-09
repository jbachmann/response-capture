import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiProperty,
} from '@nestjs/swagger';

export class ApiErrorDto {
  @ApiProperty()
  statusCode: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message: string | string[];

  @ApiProperty()
  error: string;
}

export function ApiErrors(
  options: { notFound?: boolean; conflict?: boolean } = {},
) {
  const decorators = [
    ApiBadRequestResponse({
      description: 'Invalid input or unknown properties',
      type: ApiErrorDto,
    }),
  ];
  if (options.notFound) {
    decorators.push(
      ApiNotFoundResponse({
        description: 'Record not found',
        type: ApiErrorDto,
      }),
    );
  }
  if (options.conflict) {
    decorators.push(
      ApiConflictResponse({
        description: 'Pet/order relationship conflict',
        type: ApiErrorDto,
      }),
    );
  }
  return applyDecorators(...decorators);
}
