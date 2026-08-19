
import { fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { debitCreditClient } from '$lib/utils/debitCreditClient';
import { CLIENT_SELECT, convertClientRawToClient } from '$lib/schemas/client';

export const actions = {
    // ── Mise à jour du Mode de Règlement d'une Recette ───────────────────────
    updateModeReglRecette: async ({ request, locals }: RequestEvent) => {
        const session = locals.session;
        if (!session) throw redirect(302, '/login');
        const fd        = await request.formData();
        const recetteId = parseInt(String(fd.get('recetteId')), 10);
        if (isNaN(recetteId)) return fail(400, { message: 'Identifiant recette invalide' });
        try {
            const existing = await prisma.recette.findFirst({
                where:  { id: recetteId, abonneId: session.userId },
                select: { id: true },
            });
            if (!existing) return fail(404, { message: 'Recette introuvable' });
            await prisma.recette.update({
                where: { id: recetteId },
                data:  { modeRegl: String(fd.get('modeRegl')) },
            });
            return { success: true };
        } catch (err) {
            console.error('Erreur updateModeReglRecette:', err);
            return fail(500, { message: 'Erreur serveur lors de la mise à jour du mode de règlement.' });
        }
    },

    // ── Création d'une Recette ────────────────────────────────────────────────
    createRecette: async ({ request, locals }: RequestEvent) => {
        const session = locals.session;
        if (!session) throw redirect(302, '/login');
        const fd = await request.formData();
        try {
            // ── 1. Création de l'occurrence de Recette ────────────────────────
            const recette = await prisma.recette.create({
                data: {
                    dateEmis:     new Date(String(fd.get('dateEmis'))),
                    dateRegl:     new Date(String(fd.get('dateRegl'))),
                    refFac:       String(fd.get('refFac')),
                    cliNom:       String(fd.get('cliNom')),
                    libelle:      String(fd.get('libelle')),
                    regimeTva:    fd.get('regimeTva')  ? String(fd.get('regimeTva'))  : null,
                    modeRegl:     String(fd.get('modeRegl')),
                    montRegl:     fd.get('montRegl')   ? String(fd.get('montRegl'))   : null,
                    montHt:       fd.get('montHt')     ? String(fd.get('montHt'))     : null,
                    ventilTva:    fd.get('ventilTva')  ? String(fd.get('ventilTva'))  : null,
                    montTva:      fd.get('montTva')    ? String(fd.get('montTva'))    : null,
                    montTtc:      fd.get('montTtc')    ? String(fd.get('montTtc'))    : null,
                    debours:      fd.get('debours')    ? String(fd.get('debours'))    : null,
                    penalite:     fd.get('penalite')   ? String(fd.get('penalite'))   : null,
                    nature:       String(fd.get('nature') ?? ''),
                    dateEcriture: new Date(),
                    factureId:    parseInt(String(fd.get('factureId')), 10),
                    clientId:     parseInt(String(fd.get('clientId')),  10),
                    abonneId:     session.userId,
                },
            });
            // ── 2. Mise à jour de la Facture ──────────────────────────────────
            await prisma.facture.update({
                where: { id: parseInt(String(fd.get('factureId')), 10) },
                data: {
                    dateRegl:      fd.get('dateRegl')      ? new Date(String(fd.get('dateRegl')))                          : null,
                    totRegl:       fd.get('totRegl')       ? String(fd.get('totRegl')).replace(',', '.')                   : null,
                    montCli:       fd.get('montCli')       ? String(fd.get('montCli')).replace(',', '.')                   : null,
                    solde:         fd.get('solde')         ? String(fd.get('solde')).replace(',', '.')                     : null,
                    soldePenalite: fd.get('soldePenalite') ? String(fd.get('soldePenalite')).replace(',', '.')             : null,
                },
            });
            // ── 3. Mise à jour du Compte Client si excédent ───────────────────
            const montCli = String(fd.get('montCli') ?? '0,00');
            if (parseFloat(montCli.replace(',', '.')) > 0) {
                const clientId = parseInt(String(fd.get('clientId')), 10);
                const rawClient = await prisma.client.findUnique({
                    where:  { id: clientId },
                    select: CLIENT_SELECT,
                });
                if (rawClient) {
                    const affaireId = parseInt(String(fd.get('affaireId')), 10);
                    await debitCreditClient({
                        parOrigine:   'credit',
                        parNature:    'excédent',
                        parDate:      new Date().toLocaleDateString('fr-FR'),
                        parMontant:   montCli,
                        parRefFac:    String(fd.get('refFac')),
                        parAffaireId: affaireId,
                        parFacImput:  '',
                        client:       convertClientRawToClient(rawClient),
                    });
                }
            }
            return { success: true, recetteId: recette.id };
        } catch (err) {
            console.error('Erreur createRecette:', err);
            return fail(500, { message: "Erreur serveur lors de la création de l'encaissement." });
        }
    },
};