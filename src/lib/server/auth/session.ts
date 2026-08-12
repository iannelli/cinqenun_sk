import { prisma } from '$lib/server/prisma';
import { randomUUID } from 'crypto';

const SESSION_DURATION = 1000 * 60 * 60 * 24 * 7; // 7 jours

export type Session = {
    id: number;        // number (auto-incrément)
    userId: number;    // number
    email: string;
    expiresAt: Date;
};

export async function createSession(userId:number): Promise<Session> {
    const expires = new Date(Date.now() + SESSION_DURATION);
    const session = await prisma.session.create({
        data: {
            tokenHash: randomUUID(), // pour respecter NOT NULL et UNIQUE
            abonneId: userId,
            expiresAt: expires
        },
        include: {abonne: true}
    });
    return {
        id: session.id,
        userId: session.abonne.id,
        email: session.abonne.email,
        expiresAt: session.expiresAt
    };
}

export async function validateSession(sessionId:number): Promise<Session | null> {
    const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { abonne: true }
    });
    if (!session) return null;
    if (session.expiresAt < new Date()) {
        await prisma.session.delete({where: { id: sessionId }});
        return null;
    }
    return {
        id: session.id,
        userId: session.abonne.id,
        email: session.abonne.email,
        expiresAt: session.expiresAt
    };
}