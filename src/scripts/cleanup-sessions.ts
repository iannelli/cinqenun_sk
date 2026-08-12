// Utilitaire de nettoyage manuel — non utilisé en production courante
// Usage : npx ts-node src/scripts/cleanup-sessions.ts

import { prisma } from '../lib/server/prisma';

async function cleanup() {
    const [deletedSessions, deletedRemember] = await Promise.all([
        prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
        prisma.remember.deleteMany({ where: { expiresAt: { lt: new Date() } } })
    ]);
    console.log(`Nettoyage terminé : ${deletedSessions.count} session(s) et ${deletedRemember.count} remember(s) supprimés`);
    process.exit(0);
}

cleanup();