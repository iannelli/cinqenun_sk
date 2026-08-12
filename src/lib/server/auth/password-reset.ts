import { randomBytes } from 'crypto';
import { prisma } from '$lib/server/prisma';
import { hashPassword, verifyPassword } from './password';

const TOKEN_EXPIRY_HOURS = 1;
function generateTempPassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  let result = '';
  const bytes = randomBytes(12);
  for (let i = 0; i < 12; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}
function generateToken(): string {
  return randomBytes(32).toString('hex');
}
export async function createPasswordReset(email: string) {
  const abonne = await prisma.abonne.findUnique({ where: { email } });
  if (!abonne) {
    return { success: false as const, reason: "Aucun compte n'est associé à cette adresse email." };
  }
  const tempPassword = generateTempPassword();
  const hashedTemp = await hashPassword(tempPassword);
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  await prisma.abonne.update({
    where: { id: abonne.id },
    data: {
      resetToken: token,
      resetTempHash: hashedTemp,
      resetExpiresAt: expiresAt,
    },
  });
  return { success: true as const, tempPassword, token };
}

export async function consumePasswordReset(token: string, tempPasswordInput: string, newPassword: string) {
  const abonne = await prisma.abonne.findUnique({ where: { resetToken: token } });
  if (!abonne) {
    return { valid: false as const, reason: 'Lien de réinitialisation invalide.' };
  }
  if (!abonne.resetExpiresAt || abonne.resetExpiresAt < new Date()) {
    await prisma.abonne.update({
      where: { id: abonne.id },
      data: { resetToken: null, resetTempHash: null, resetExpiresAt: null },
    });
    return { valid: false as const, reason: 'Ce lien a expiré. Veuillez refaire une demande.' };
  }
  const tempValid = await verifyPassword(tempPasswordInput, abonne.resetTempHash!);
  if (!tempValid) {
    return { valid: false as const, reason: 'Le mot de passe provisoire est incorrect.' };
  }
  const hashedNew = await hashPassword(newPassword);
  await prisma.abonne.update({
    where: { id: abonne.id },
    data: {
      passwordHash: hashedNew,
      resetToken: null,
      resetTempHash: null,
      resetExpiresAt: null,
    },
  });
  return { valid: true as const, email: abonne.email };
}