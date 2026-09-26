import { redirect } from '@sveltejs/kit';
import { prisma }   from '$lib/server/prisma';

export const actions = {
    default: async ({ cookies, locals }) => {
        if (locals.session) {
            await prisma.session.delete({
                where: { id: locals.session.id }
            });
        }
        cookies.delete('sessionId', { path: '/' });
        cookies.delete('rememberToken', { path: '/' });
        throw redirect(302, '/logout'); // ← était '/login'
    }
};