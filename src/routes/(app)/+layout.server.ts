import { redirect }                                from '@sveltejs/kit';
import { prisma }                                  from '$lib/server/prisma';
import { ABONNE_SELECT, convertAbonneRawToAbonne } from '$lib/schemas/abonne';
import { TARIF_SELECT, convertTarifRawToTarif }    from '$lib/schemas/tarif';

// ─────────────────────────────────────────────────────────────────────────────
// LOAD à l'Ouverture de l'Application *****
// ─────────────────────────────────────────────────────────────────────────────
export const load = async ({ locals, depends }) => {
    if (!locals.user) throw redirect(302, '/login');
    const userId = locals.user!.id;
    // ─── Dépendances invalidables à la demande ────────────────────
    depends('app:tarifs');   // invalidate('app:tarifs')  après modification d'un tarif
    depends('app:clients');  // invalidate('app:clients') après modification d'un client
    depends('app:abonne');   // invalidate('app:abonne')  après modification du statut fiscal

    // ─── Chargement initial : tarifs, clients, abonné ─────────────
    const [tarifsRaw, clientsRaw, abonneRaw] = await Promise.all([
        prisma.tarif.findMany({
            where:   { abonneId: userId },
            orderBy: { motCle: 'asc' },
            select:  TARIF_SELECT,
        }),
        prisma.client.findMany({
            where:   { abonneId: userId },
            select:  { id: true, libClient: true },
            orderBy: { libClient: 'asc' },
        }),
        prisma.abonne.findUniqueOrThrow({
            where:  { id: userId },
            select: ABONNE_SELECT,
        }),
    ]);

    return {
        user:      locals.user,
        tarifs:    tarifsRaw.map(convertTarifRawToTarif),
        clients:   clientsRaw,
        abonne:    convertAbonneRawToAbonne(abonneRaw),
        statutRaw: abonneRaw.statut ?? '',
    };
};