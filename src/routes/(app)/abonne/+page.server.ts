import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { ABONNE_SELECT, parseIdentite, parseAbonnement, parseStatut } from '$lib/schemas/abonne';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw redirect(303, '/login');
    const abonne = await prisma.abonne.findUniqueOrThrow({
        where: { id: locals.user.id },
        select: ABONNE_SELECT
    });
    const identite = parseIdentite(abonne.identite);
    const abonnement = parseAbonnement(abonne.abonnement);
    const statut = parseStatut(abonne.statut);
    // Détecte un éventuel paramètre ?welcome pour la modale
    const welcomeParam = url.searchParams.get('welcome');
    const welcome = welcomeParam ? { email: abonne.email } : null;
    return { abonne, identite, abonnement, statut, welcome };
};