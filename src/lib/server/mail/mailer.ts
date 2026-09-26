import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, APP_URL } from '$env/static/private';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host:   SMTP_HOST,
    port:   Number(SMTP_PORT),
    secure: false,
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
    },
});

export async function sendConfirmationEmail(email: string, token: string) {
    const confirmUrl = `${APP_URL}/verify-email?token=${token}`;
    await transporter.sendMail({
        from:    `"Cinqenun" <${SMTP_FROM}>`,
        to:      email,
        subject: 'Cinqenun - Confirmez votre inscription',
        html: `
            <h1>Confirmez votre inscription à Cinqenun</h1>
            <p>Vous avez demandé la création d'un compte sur Cinqenun.</p>
            <p>Pour finaliser votre inscription, cliquez sur le bouton ci-dessous :</p>
            <p>
                <a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Confirmer mon inscription</a>
            </p>
            <p style="font-size:0.85em;color:#64748b;">
                Ce lien est valable 24 heures.<br>
                Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
            </p>
            <p>Cordialement,<br>L'équipe Cinqenun</p>
         `,
    });
}

export async function sendWelcomeEmail(email: string, password: string) {
    await transporter.sendMail({
        from:    `"Cinqenun" <${SMTP_FROM}>`,
        to:      email,
        subject: "Bienvenue dans l'application Cinqenun !",
        html: `
            <h1>Bienvenue dans l'application Cinqenun !</h1>
            <p>Votre compte a été créé avec succès.</p>
            <p><strong>Vos identifiants :</strong></p>
            <ul>
                <li>Email : ${email}</li>
                <li>Mot de passe : ${password}</li>
            </ul>
            <p>Vous bénéficiez d'un essai gratuit de 30 jours.</p>
            <p>Cordialement,<br>L'équipe Cinqenun</p>
        `,
    });
}

export async function sendResetPasswordEmail(email: string, tempPassword: string) {
    await transporter.sendMail({
        from:    `"Cinqenun" <${SMTP_FROM}>`,
        to:      email,
        subject: 'Cinqenun - Réinitialisation de votre mot de passe',
        html: `
            <h1>Réinitialisation de votre mot de passe</h1>
            <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
            <p><strong>Votre mot de passe provisoire :</strong></p>
            <p style="font-size:1.2em;font-family:monospace;background:#f1f5f9;padding:10px 16px;border-radius:6px;display:inline-block;">${tempPassword}</p>
            <p>Saisissez ce mot de passe provisoire sur la page de réinitialisation qui s'est ouverte dans votre navigateur.</p>
            <p style="font-size:0.85em;color:#64748b;">
                Ce mot de passe provisoire est valable 1 heure.<br>
                Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
            </p>
            <p>Cordialement,<br>L'équipe Cinqenun</p>
        `,
    });
}