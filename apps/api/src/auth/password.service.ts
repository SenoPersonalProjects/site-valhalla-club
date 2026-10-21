import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { invalidRegistration } from './auth.validation';

export const PASSWORD_COST = 12;
export const PASSWORD_MIN_LENGTH = 12;

@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    if (
      password.length < PASSWORD_MIN_LENGTH ||
      Buffer.byteLength(password, 'utf8') > 72
    ) {
      invalidRegistration(
        'INVALID_PASSWORD',
        'A senha deve ter pelo menos 12 caracteres e no máximo 72 bytes UTF-8',
      );
    }
    return bcrypt.hash(password, PASSWORD_COST);
  }

  async verify(password: string, hash: string | null): Promise<boolean> {
    // A valid synthetic hash keeps absent accounts on the same password-check path.
    const dummy =
      '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';
    const matches = await bcrypt.compare(password, hash ?? dummy);
    return (
      hash !== null && Buffer.byteLength(password, 'utf8') <= 72 && matches
    );
  }
}
