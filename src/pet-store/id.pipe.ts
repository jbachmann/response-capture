import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

@Injectable()
export class IdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const id = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id < 1) {
      throw new BadRequestException('ID must be a positive safe integer');
    }
    return id;
  }
}

const rawIdParam = createParamDecorator(
  (name: string, context: ExecutionContext): string => {
    const request = context
      .switchToHttp()
      .getRequest<{ params: Record<string, string> }>();
    return request.params[name];
  },
);

// A custom parameter avoids ValidationPipe's eager Number conversion so IdPipe
// can reject non-decimal inputs such as "1e2" before parsing them.
export function IdParam(name: string): ParameterDecorator {
  return rawIdParam(name, IdPipe);
}
