import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
@Injectable()
export class IdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    if (
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < 1
    )
      throw new BadRequestException('ID must be a positive safe integer');
    return Number(value);
  }
}
