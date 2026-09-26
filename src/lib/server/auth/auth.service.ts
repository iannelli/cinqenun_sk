import { prisma }        from '$lib/server/prisma';
import { hashPassword }  from './password';
import { createSession } from './session';

// Inscription classique
export async function register(email: string, password: string) {
    const hashedPassword = await hashPassword(password);
    const user = await prisma.abonne.create({
        data: {
            email,
            passwordHash: hashedPassword,
            anFact:       new Date().getFullYear().toString(),
        },
    });
    const session = await createSession(user.id);
    return { user, session };
}

// Nouvelle inscription depuis un pending (mot de passe déjà hashé)
export async function registerFromPending(email: string, hashedPassword: string) {
    const user = await prisma.abonne.create({
        data: {
            email,
            passwordHash: hashedPassword,
            anFact:       new Date().getFullYear().toString(),
        },
    });
    const session = await createSession(user.id);
    return { user, session };
}