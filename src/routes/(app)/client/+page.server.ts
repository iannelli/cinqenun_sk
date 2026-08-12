import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/prisma';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { ClientFormSchema, CLIENT_SELECT, convertClientRawToClient } from '$lib/schemas/client';

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
    }
};