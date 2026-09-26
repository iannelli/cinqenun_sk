import { z } from 'zod';

const emailRegex    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{10,}$/;

export const RegisterFormSchema = z.object({
  email:           z.string().min(1, 'Les 2 adresses courriel doivent être servies.'),
  emailConfirm:    z.string().min(1, 'Les 2 adresses courriel doivent être servies.'),
  password:        z.string().min(1, 'Les 2 mots de passe doivent être servis.'),
  passwordConfirm: z.string().min(1, 'Les 2 mots de passe doivent être servis.'),
})
  .refine(d => emailRegex.test(d.email), {
    message: "L'adresse courriel n'est pas valide.",
    path:    ['email'],
  })
  .refine(d => d.email === d.emailConfirm, {
    message: 'Les 2 adresses courriel doivent être identiques.',
    path:    ['emailConfirm'],
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