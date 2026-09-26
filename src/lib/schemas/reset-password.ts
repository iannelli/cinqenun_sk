import { z } from 'zod';

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{10,}$/;

export const ResetPasswordSchema = z.object({
    tempPassword:    z.string().min(1, 'Le mot de passe provisoire est obligatoire.'),
    password:        z.string().min(1, 'Le nouveau mot de passe est obligatoire.'),
    passwordConfirm: z.string().min(1, 'La confirmation est obligatoire.'),
})
.refine(d => passwordRegex.test(d.password), {
    message:
        'Le mot de passe doit contenir au moins :\n' +
        '- une lettre minuscule (a à z) ;\n' +
        '- une lettre majuscule (A à Z) ;\n' +
        '- un chiffre (0 à 9) ;\n' +
        '- un caractère spécial ;\n' +
        '- et comporter une longueur minimale de 10 caractères.',
    path: ['password'],
})
.refine(d => d.password === d.passwordConfirm, {
    message: 'Les 2 mots de passe doivent être identiques.',
    path:    ['passwordConfirm'],
});