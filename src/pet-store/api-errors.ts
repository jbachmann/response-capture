import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiProperty,
} from '@nestjs/swagger';
export class ApiErrorDto {
  @ApiProperty() statusCode: number;
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message: string | string[];
  @ApiProperty() error: string;
}
export function ApiErrors(missing = false, conflict = false) {
  return applyDecorators(
    ApiBadRequestResponse({
      description: 'Invalid input or unknown properties',
      type: ApiErrorDto,
    }),
    ...(missing
      ? [
          ApiNotFoundResponse({
            description: 'Record not found',
            type: ApiErrorDto,
          }),
        ]
      : []),
    ...(conflict
      ? [
          ApiConflictResponse({
            description: 'Pet/order relationship conflict',
            type: ApiErrorDto,
          }),
        ]
      : []),
  );
}
