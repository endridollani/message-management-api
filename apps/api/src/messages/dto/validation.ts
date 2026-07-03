import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export const ID_PATTERN = /^[A-Za-z0-9_:.-]+$/;
export const MAX_METADATA_BYTES = 10_240;

export function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function MaxJsonSize(maxBytes: number, validationOptions?: ValidationOptions): PropertyDecorator {
  return (object, propertyName) => {
    registerDecorator({
      constraints: [maxBytes],
      options: validationOptions,
      propertyName: String(propertyName),
      target: object.constructor,
      validator: MaxJsonSizeConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'maxJsonSize', async: false })
export class MaxJsonSizeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (value === undefined || value === null) {
      return true;
    }

    const [maxBytes] = args.constraints as [number];

    try {
      return Buffer.byteLength(JSON.stringify(value), 'utf8') <= maxBytes;
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    const [maxBytes] = args.constraints as [number];
    return `${args.property} must be no larger than ${maxBytes} JSON bytes`;
  }
}

export function IsPlainJsonObject(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object, propertyName) => {
    registerDecorator({
      options: validationOptions,
      propertyName: String(propertyName),
      target: object.constructor,
      validator: IsPlainJsonObjectConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'isPlainJsonObject', async: false })
export class IsPlainJsonObjectConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null) {
      return true;
    }

    if (Array.isArray(value) || typeof value !== 'object') {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a plain JSON object`;
  }
}
