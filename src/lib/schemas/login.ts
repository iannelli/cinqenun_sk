import { z } from 'zod';

// ─── Schéma Zod (inchangé, utilisé par Superforms) ──────────────
export const LoginFormSchema = z.object({
	email:    z.email('Email invalide.'),
	password: z.string().min(1, "Le mot de passe est obligatoire.")
});
