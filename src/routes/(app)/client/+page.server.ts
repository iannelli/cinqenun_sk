import { redirect, fail }                    from '@sveltejs/kit';
import type { PageServerLoad, Actions }     from './$types';
import type { Prisma }                       from '@prisma/client';
import { prisma }                            from '$lib/server/prisma';
import { superValidate, message }            from 'sveltekit-superforms';
import { zod4 }                              from 'sveltekit-superforms/adapters';
import { ClientFormSchema, CLIENT_SELECT, convertClientRawToClient, parseCredit, serializeCredit } from '$lib/schemas/client';

// ─── Helpers ─────────────────────────────────────────────────────
function requireUser(locals: App.Locals) {
    if (!locals.user) throw redirect(302, '/login');
    return locals.user;
}
async function getOwnedClient(formData: FormData, userId: number) {
    const id = Number(formData.get('id'));
    if (!id || isNaN(id)) return { error: fail(400, { error: 'Identifiant invalide.' }) };
    const existing = await prisma.client.findFirst({ where: { id, abonneId: userId } });
    if (!existing) return { error: fail(404, { error: 'Client introuvable.' }) };
    return { id, existing };
}
// ─── Helpers compte client ────────────────────────────────────────
function parseFrSrv(val: string): number {
    return parseFloat(val.replace(/\s/g, '').replace(',', '.')) || 0;
}
function formatFrSrv(val: number): string {
    return val.toFixed(2).replace('.', ',');
}

// ─── Load ────────────────────────────────────────────────────────
export const load: PageServerLoad = async ({ locals }) => {
    const user = requireUser(locals);
    const clients = await prisma.client.findMany({
        where:   { abonneId: user.id },
        orderBy: { libClient: 'asc' },
        select:  CLIENT_SELECT
    });
    const createForm = await superValidate(zod4(ClientFormSchema));
    return {
        clients: clients.map(convertClientRawToClient),
        createForm
    };
};

// ─── Actions ─────────────────────────────────────────────────────
export const actions: Actions = {
    create: async ({ request, locals }) => {
        const user = requireUser(locals);
        const form = await superValidate(request, zod4(ClientFormSchema));
        if (!form.valid) return fail(400, { form });
        try {
            const client = await prisma.client.create({
                data: {
                    ...form.data,
                    abonneId: user.id
                } as Prisma.ClientUncheckedCreateInput,
                select: { id: true, libClient: true },  // ← retourner les champs nécessaires
            });
            return message(form, { text: 'Client créé avec succès.', client });  // ← inclure le client
        } catch (err) {
            console.error('[client/create]', err);
            return message(form, 'Erreur serveur lors de la création.', { status: 500 });
        }
    },

    update: async ({ request, locals }) => {
        const user = requireUser(locals);
        const formData = await request.formData();
        const owned = await getOwnedClient(formData, user.id);
        if ('error' in owned) return owned.error;
        const form = await superValidate(formData, zod4(ClientFormSchema));
        if (!form.valid) return fail(400, { form });
        try {
            await prisma.client.update({
                where: { id: owned.id },
                data:  form.data as Prisma.ClientUpdateInput
            });
        } catch (err) {
            console.error('[client/update]', err);
            return message(form, 'Erreur serveur lors de la mise à jour.', { status: 500 });
        }
        return message(form, 'Client modifié avec succès.');
    },

    delete: async ({ request, locals }) => {
        const session = locals.session;
        if (!session) throw redirect(302, '/login');
        const fd = await request.formData();
        const id = parseInt(String(fd.get('id')), 10);
        if (isNaN(id)) return fail(400, { message: 'Identifiant invalide' });
        await prisma.client.delete({ where: { id } });
        return { success: true };
    },

    rembourser: async ({ request, locals }) => {
        const user     = requireUser(locals);
        const fd       = await request.formData();
        const clientId = Number(fd.get('clientId'));
        const refFac0  = String(fd.get('refFac0'));
        const montant  = String(fd.get('montant')).trim();
        const date     = String(fd.get('date')).trim();
        const client   = await prisma.client.findFirst({ where: { id: clientId, abonneId: user.id } });
        if (!client) return fail(404, { error: 'Client introuvable.' });
        const lignes   = parseCredit(client.credit) ?? [];
        const idx      = lignes.findIndex(l => l.refFac0 === refFac0);
        if (idx === -1) return fail(404, { error: 'Facture introuvable.' });
        // Ajout du mouvement (montant négatif)
        lignes[idx].mouvements0.push({
            nature0:   'remboursement',
            date0:     date,
            montant0:  '-' + formatFrSrv(parseFrSrv(montant)),
            facImput0: '',
        });
        // Recalculer soldeRemb0
        lignes[idx].soldeRemb0 = formatFrSrv(
            lignes[idx].mouvements0
                .filter(m => m.nature0 === 'remboursement' || m.nature0 === 'annulation remboursement')
                .reduce((acc, m) => acc + parseFrSrv(m.montant0), 0)
        );
        // Recalculer solde0
        lignes[idx].solde0 = formatFrSrv(
            lignes[idx].mouvements0.reduce((acc, m) => acc + parseFrSrv(m.montant0), 0)
        );
        // Recalculer soldeCredit global
        const soldeCredit = lignes.reduce((acc, l) => acc + parseFrSrv(l.solde0), 0);
        await prisma.client.update({
            where: { id: clientId },
            data:  {
                credit:      serializeCredit(lignes),
                soldeCredit: formatFrSrv(soldeCredit),
            },
        });
        return { success: true as const, action: 'rembourser' as const };

    },

    annulerRemboursement: async ({ request, locals }) => {
        const user     = requireUser(locals);
        const fd       = await request.formData();
        const clientId = Number(fd.get('clientId'));
        const refFac0  = String(fd.get('refFac0'));
        const montant  = String(fd.get('montant')).trim();
        const date     = String(fd.get('date')).trim();
        const client   = await prisma.client.findFirst({ where: { id: clientId, abonneId: user.id } });
        if (!client) return fail(404, { error: 'Client introuvable.' });
        const lignes   = parseCredit(client.credit) ?? [];
        const idx      = lignes.findIndex(l => l.refFac0 === refFac0);
        if (idx === -1) return fail(404, { error: 'Facture introuvable.' });
        // Ajout du mouvement (montant positif saisi par l'utilisateur)
        lignes[idx].mouvements0.push({
            nature0:   'annulation remboursement',
            date0:     date,
            montant0:  formatFrSrv(parseFrSrv(montant)),
            facImput0: '',
        });
        // Recalculer soldeRemb0
        lignes[idx].soldeRemb0 = formatFrSrv(
            lignes[idx].mouvements0
                .filter(m => m.nature0 === 'remboursement' || m.nature0 === 'annulation remboursement')
                .reduce((acc, m) => acc + parseFrSrv(m.montant0), 0)
        );
        // Recalculer solde0
        lignes[idx].solde0 = formatFrSrv(
            lignes[idx].mouvements0.reduce((acc, m) => acc + parseFrSrv(m.montant0), 0)
        );
        // Recalculer soldeCredit global
        const soldeCredit = lignes.reduce((acc, l) => acc + parseFrSrv(l.solde0), 0);
        await prisma.client.update({
            where: { id: clientId },
            data:  {
                credit:      serializeCredit(lignes),
                soldeCredit: formatFrSrv(soldeCredit),
            },
        });
        return { success: true as const, action: 'annulerRemboursement' as const };
    },
};