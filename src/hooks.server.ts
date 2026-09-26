import { type Handle, redirect }          from '@sveltejs/kit';
import { prisma }                         from '$lib/server/prisma';
import { validateSession, createSession } from '$lib/server/auth/session';
import { validateRememberToken }          from '$lib/server/auth/remember';
import { setSessionCookie }               from '$lib/server/auth/cookies';

// ─── Nettoyage des sessions et remember expirés ───────────────────────────────
let cleanupDone = false;
async function cleanupExpiredSessions() {
    if (cleanupDone) return;
    cleanupDone = true;
    try {
        const [deletedSessions, deletedRemember] = await Promise.all([
            prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
            prisma.remember.deleteMany({ where: { expiresAt: { lt: new Date() } } })
        ]);
        console.log(`[Cleanup boot] ${deletedSessions.count} session(s) et ${deletedRemember.count} remember(s) supprimés`);
    } catch (e) {
        console.error('[Cleanup boot] Erreur:', e);
    }
}
// Nettoyage au démarrage du serveur
cleanupExpiredSessions();
// Nettoyage périodique toutes les heures
setInterval(async () => {
    try {
        const [deletedSessions, deletedRemember] = await Promise.all([
            prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
            prisma.remember.deleteMany({ where: { expiresAt: { lt: new Date() } } })
        ]);
        console.log(`[Cleanup horaire] ${deletedSessions.count} session(s) et ${deletedRemember.count} remember(s) supprimés`);
    } catch (e) {
        console.error('[Cleanup horaire] Erreur:', e);
    }
}, 60 * 60 * 1000);

// ─── Handle ───────────────────────────────────────────────────────────────────
export const handle: Handle = async ({ event, resolve }) => {
    // 1. Session normale
    const sessionId = event.cookies.get('sessionId');
    if (sessionId) {
        const session = await validateSession(Number(sessionId));
        if (session) {
            event.locals.user = {
                id:    session.userId,
                email: session.email
            };
            event.locals.session = session;
        }
    }
    // 2. Remember me (si pas de session valide)
    if (!event.locals.user) {
        const remember = event.cookies.get('rememberToken');
        if (remember) {
            const user = await validateRememberToken(remember);
            if (user) {
                // Nettoyer les anciennes sessions expirées de cet utilisateur
                await prisma.session.deleteMany({
                    where: {
                        abonneId: user.id,
                        expiresAt: { lt: new Date() }
                    }
                });
                const session = await createSession(user.id);
                setSessionCookie(event.cookies, session);
                event.locals.user = user;
                event.locals.session = session;
                // Rediriger vers dashboard si on est sur /login ou /
                const url = event.url.pathname;
                if (url === '/login' || url === '/') {
                    throw redirect(302, '/dashboard');
                }
            }
        }
    }
    return resolve(event);
};