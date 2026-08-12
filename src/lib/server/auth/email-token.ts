import { randomBytes } from 'crypto';
import { prisma } from '$lib/server/prisma';

const TOKEN_EXPIRY_HOURS = 24;

export function generateToken(): string {
    return randomBytes(32).toString('hex');
}
export async function createPendingRegistration (
    email: string,
    hashedPassword: string
): Promise<string> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
    await prisma.pendingRegistration.deleteMany({ where: { email } });
    await prisma.pendingRegistration.create({
        data: {
            email,
            password: hashedPassword,
            token,
            expiresAt,
        },
    });
     return token;
}

// Appelé au clic du lien (peut être Chrome)
export async function confirmPendingRegistration(token: string) {
    const pending = await prisma.pendingRegistration.findUnique({
        where: { token },
     });
    if (!pending) {
        return { valid: false as const, reason: 'Lien de confirmation invalide.' };
    }
    if (pending.expiresAt < new Date()) {
        await prisma.pendingRegistration.delete({ where: { id: pending.id } });
        return { valid: false as const, reason: 'Ce lien a expiré. Veuillez vous réinscrire.' };
    }
    await prisma.pendingRegistration.update({
        where: { id: pending.id },
        data: { confirmed: 1 },
    });
    return { valid: true as const, email: pending.email };
}

// Appelé par le polling depuis Firefox
export async function consumeConfirmedRegistration(email: string) {
    const pending = await prisma.pendingRegistration.findFirst({
        where: { email, confirmed: 1 },
     });
    if (!pending) return null;
    await prisma.pendingRegistration.delete({ where: { id: pending.id } });
    return {
        email: pending.email,
        hashedPassword: pending.password,
    };
}
