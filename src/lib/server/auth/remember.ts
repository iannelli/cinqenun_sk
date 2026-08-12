import { prisma } from '$lib/server/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const REMEMBER_DURATION = 1000 * 60 * 60 * 24 * 30; // 30 jours

export async function createRememberToken(abonneId: number) {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = await bcrypt.hash(token, 12);
    const expires = new Date(Date.now() + REMEMBER_DURATION);
    await prisma.remember.create({
        data: {
        abonneId,
        tokenHash: hash,
        expiresAt: expires
        }
    });
    return token;
}

export async function validateRememberToken(token: string) {
    const tokens = await prisma.remember.findMany({
        where: {
        expiresAt: { gt: new Date() }
        },
        include: { abonne: true }
    });
    for (const row of tokens) {
        const match = await bcrypt.compare(token, row.tokenHash);
        if (match) {
            return {
                id: row.abonne.id,
                email: row.abonne.email
            };
        }
    }
    return null;
}