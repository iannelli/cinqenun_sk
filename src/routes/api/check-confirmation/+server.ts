import { type RequestHandler, json }        from '@sveltejs/kit';
import { consumeConfirmedRegistration }     from '$lib/server/auth/email-token';
import { registerFromPending }              from '$lib/server/auth/auth.service';
import { setSessionCookie }                 from '$lib/server/auth/cookies';
import { prisma }                           from '$lib/server/prisma';
import { Prisma }                           from '@prisma/client';
import { parseAbonnement, buildAbonnement } from '$lib/schemas/abonne';
import { genererNumAbonne, dateAujourdhui } from '$lib/schemas/commun';

/**
 * Initialise l'abonnement d'un nouvel abonné :
 * - dateOuvert0 = date du jour (jj/mm/aaaa)
 * - numAbonne0  = année courante (4 car.) + compteur commun.numAbonne (4 car.)
 * - etatAbonne0 = 'Actif'
 * - incrémente commun.numAbonne de +1
 */
async function initialiserAbonnement(email: string) {
    // 1. Récupérer l'abonné fraîchement créé
    const abonne = await prisma.abonne.findUnique({
        where: { email },
        select: { id: true, abonnement: true }
    });
    if (!abonne) {
        console.error(`[initialiserAbonnement] Abonné introuvable pour ${email}`);
        return;
    }
    // 2. Vérifier que l'abonnement n'est pas déjà initialisé
    const abonnement = parseAbonnement(abonne.abonnement);
    if (abonnement.numAbonne0.trim() !== '') {
        return; // déjà initialisé
    }
    // 3. Incrémenter le compteur dans la table commun (id = 1)
    const communUpdated = await prisma.commun.update({
        where: { id: 1 },
        data: {
            numAbonne: { increment: 1 }
        },
        select: { numAbonne: true }
    });
    const compteur = communUpdated.numAbonne ?? 1;
    // 4. Générer le numéro d'abonné et la date d'ouverture
    const numAbonne0    = genererNumAbonne(compteur);
    const dateOuvert0   = dateAujourdhui();
    // 5. Mettre à jour le champ composite abonnement
    const newAbonnement = buildAbonnement({
        numAbonne0,
        dateOuvert0,
        dateFerme0:  '',
        etatAbonne0: 'Actif',
        soldeAbonne0:'0'
    });
    await prisma.abonne.update({
        where: { id: abonne.id },
        data: {
            abonnement: newAbonnement,
            updatedAt: new Date()
        }
    });
}

export const POST: RequestHandler = async ({ request, cookies }) => {
    const { email } = await request.json();
    if (!email) {
        return json({ confirmed: false });
    }
    const pending = await consumeConfirmedRegistration(email);
    if (!pending) {
        return json({ confirmed: false });
    }
    // ── Créer le compte ──
    try {
        const result = await registerFromPending(pending.email, pending.hashedPassword);
        setSessionCookie(cookies, result.session);
        // ── Initialiser l'abonnement du nouvel abonné ──
        await initialiserAbonnement(pending.email);
        return json({ confirmed: true });
    } catch (error) {
        console.error('Erreur création compte:', error);
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
        ) {
            return json({ confirmed: false, error: 'Ce compte existe déjà.' }, { status: 409 });
        }
        return json({ confirmed: false, error: 'Erreur serveur.' }, { status: 500 });
    }
};