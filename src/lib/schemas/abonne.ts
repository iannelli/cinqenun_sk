import { z } from 'zod';
import type { Prisma } from '@prisma/client';

// ═════════════════════════════════════════════════════════════════
//  SÉLECTEUR PRISMA (partagé par toutes les sous-pages)
// ═════════════════════════════════════════════════════════════════
export const ABONNE_SELECT = {
    id:             true,
    email:          true,
    identite:       true,
    abonnement:     true,
    statut:         true,
    reprise:        true,
    tvaIntra:       true,
    temoinAsso:     true,
    temoinCgu:      true,
    temoinCgv:      true,
    temoinLogo:     true,
    logoText:       true,
    logoData:       true,
    logoMimeType:   true,
    urlWeb:         true,
    anFact:         true,
    numFact:        true,
    nbrMontAffaire: true,
    suiviFac:       true,
    blocNote:       true,
} satisfies Prisma.AbonneSelect;
type AbonneRaw = Prisma.AbonneGetPayload<{ select: typeof ABONNE_SELECT }>;

// ═════════════════════════════════════════════════════════════════
//  VALIDATION SIREN (partagée client + serveur)
// ═════════════════════════════════════════════════════════════════
function luhnCheck(num: string): boolean {
    let sum = 0;
    for (let i = 0; i < num.length; i++) {
        let digit = parseInt(num.charAt(i), 10);
        if (i % 2 === 1) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
    }
    return sum % 10 === 0;
}
export function validerSIREN(siren: string): { valid: boolean; message: string } {
    if (!siren || siren.trim() === '') {
        return {
            valid: false,
            message: 'Le N° SIREN est absent. Sa présence est indispensable à la confection des Devis et Facture.'
        };
    }
    const cleaned = siren.replace(/\s+/g, '');
    if (!/^\d{9}$/.test(cleaned)) {
        return { valid: false, message: 'Le numéro SIREN doit contenir exactement 9 chiffres.' };
    }
    if (!luhnCheck(cleaned)) {
        return { valid: false, message: "Le numéro SIREN n'est pas valide (échec de la clé de contrôle)." };
    }
    return { valid: true, message: '' };
}

// ═════════════════════════════════════════════════════════════════
//  1. IDENTIFICATION  (champ composite : identite)
// ═════════════════════════════════════════════════════════════════
export type IdentiteDerived = {
    raisonSociale0:    string;
    adresse0:          string;
    adresseCompl0:     string;
    cp0:               string;
    ville0:            string;
    nomPrenomContact0: string;
    telFixe0:          string;
    telPortable0:      string;
    siren0:            string;
    iban0:             string;
    bic0:              string;
};
export function parseIdentite(identite: string | null | undefined): IdentiteDerived {
    const p = identite ? identite.split('|') : [];
    return {
        raisonSociale0:    p[0] ?? '',
        adresse0:          p[1] ?? '',
        adresseCompl0:     p[2] ?? '',
        cp0:               p[3] ?? '',
        ville0:            p[4] ?? '',
        nomPrenomContact0: p[5] ?? '',
        telFixe0:          p[6] ?? '',
        telPortable0:      p[7] ?? '',
        siren0:            p[8] ?? '',
        iban0:             p[9] ?? '',
        bic0:              p[10] ?? ''
    };
}
export function buildIdentite(d: IdentiteDerived): string {
    return [
        d.raisonSociale0, d.adresse0, d.adresseCompl0, d.cp0, d.ville0,
        d.nomPrenomContact0, d.telFixe0, d.telPortable0, d.siren0, d.iban0, d.bic0
    ].join('|');
}

// ─── Logo texte  (champ composite : logoText) ───────────────────
export type LogoTextDerived = {
    ligne10: string;
    ligne20: string;
};
export function parseLogoText(logoText: string | null | undefined): LogoTextDerived {
    const p = logoText ? logoText.split('|') : [];
    return {
        ligne10: p[0] ?? '',
        ligne20: p[1] ?? ''
    };
}
export function buildLogoText(d: LogoTextDerived): string {
    return [d.ligne10, d.ligne20].join('|');
}

// ─── Schema formulaire identification ────────────────────────────
export const IdentificationFormSchema = z.object({
    raisonSociale0:    z.string().min(1, "La raison sociale est obligatoire."),
    adresse0:          z.string().min(1, "L'adresse est obligatoire."),
    adresseCompl0:     z.string().default(''),
    cp0:               z.string().min(1, "Le Code Postal est obligatoire."),
    ville0:            z.string().min(1, "Le Libellé de la Ville est obligatoire."),
    nomPrenomContact0: z.string().default(''),
    telFixe0:          z.string().default(''),
    telPortable0:      z.string().default(''),
    siren0:            z.string().default(''),
    iban0:             z.string().default(''),
    bic0:              z.string().default(''),
    temoinLogo:        z.number().default(0),
    ligne10:           z.string().default(''),
    ligne20:           z.string().default(''),
    urlWeb:            z.string().max(40, "L'URL ne peut pas dépasser 40 caractères.").default(''),
    temoinCgv:         z.boolean().default(false)
});
export type IdentificationFormData = z.infer<typeof IdentificationFormSchema>;

// ═════════════════════════════════════════════════════════════════
//  2. FISCALITÉ  (champ composite : statut + champs Prisma directs)
// ═════════════════════════════════════════════════════════════════
export type StatutDerived = {
    typeActivite0: string;
    dateDebActiv0: string;
    statutFiscal0: string;
    declaTva0:     string;
    impotIr0:      string;
    versLib0:      string;
    facAnnul0:     string;
};
export function parseStatut(statut: string | null | undefined): StatutDerived {
    const p = statut ? statut.split('|') : [];
    return {
        typeActivite0:  p[0] ?? '',
        dateDebActiv0:  p[1] ?? '',
        statutFiscal0:  p[2] ?? '',
        declaTva0:      p[3] ?? '',
        impotIr0:       p[4] ?? '',
        versLib0:       p[5] ?? '',
        facAnnul0:      p[6] ?? ''
    };
}
export function buildStatut(d: StatutDerived): string {
    return [
        d.typeActivite0, d.dateDebActiv0, d.statutFiscal0,
        d.declaTva0, d.impotIr0, d.versLib0, d.facAnnul0
    ].join('|');
}
export const FiscaliteFormSchema = z.object({
    // statut (composite)
    typeActivite0:     z.string().default(''),
    dateDebActiv0:     z.string().default(''),
    statutFiscal0:     z.string().default(''),
    declaTva0:         z.string().default(''),
    impotIr0:          z.string().default(''),
    versLib0:          z.boolean().default(false),
    facAnnul0:         z.string().default(''),
    // champs Prisma directs
    tvaIntra: z.string().max(16, "Le N° TVA Intracommunautaire ne peut pas dépasser 16 caractères.").default(''),
    temoinAsso:        z.boolean().default(false),
    reprise:           z.string().default('')
});
export type FiscaliteFormData = z.infer<typeof FiscaliteFormSchema>;

// ═════════════════════════════════════════════════════════════════
//  3. ABONNEMENT  (champ composite : abonnement)
// ═════════════════════════════════════════════════════════════════
export type AbonnementDerived = {
    numAbonne0:   string;
    dateOuvert0:  string;
    dateFerme0:   string;
    etatAbonne0:  string;
    soldeAbonne0: string;
};
export function parseAbonnement(abonnement: string | null | undefined): AbonnementDerived {
    const p = abonnement ? abonnement.split('|') : [];
    return {
        numAbonne0:   p[0] ?? '',
        dateOuvert0:  p[1] ?? '',
        dateFerme0:   p[2] ?? '',
        etatAbonne0:  p[3] ?? '',
        soldeAbonne0: p[4] ?? ''
    };
}
export function buildAbonnement(d: AbonnementDerived): string {
    return [
        d.numAbonne0, d.dateOuvert0, d.dateFerme0, d.etatAbonne0, d.soldeAbonne0
    ].join('|');
}
export const AbonnementFormSchema = z.object({
    numAbonne0:    z.string().default(''),
    dateOuvert0:   z.string().default(''),
    dateFerme0:    z.string().default(''),
    etatAbonne0:   z.string().default(''),
    soldeAbonne0:  z.string().default('')
});
export type AbonnementFormData = z.infer<typeof AbonnementFormSchema>;

// ═════════════════════════════════════════════════════════════════
//  4. COMPTEURS AFFAIRES  (champ composite : nbrMontAffaire)
// ═════════════════════════════════════════════════════════════════
//  Structure du pipe (14 valeurs dont 6 paires nbre|montant par situation) :
//  Index  0 : nbre  situation '00x'  (Affaire à Initier)
//  Index  1 : nbre  situation '10x'  (Affaire  en Attente : avec au moins un Devis et/ou Facture 'brouillon' et/ou Facture Annulée)
//  Index  2 : nbre  situation '20x'  (en Cours : au moins une facture validée nonAnnulée et nonSoldée)
//  Index  3 : mont  (réservé)
//  Index  4 : nbre  situation '30x'  (en Cours – toutes les factures validées et soldées et dateRegl<3mois)
//  Index  5 : mont  (réservé)
//  Index  6 : nbre  situation '11a'  (Inactive – annulée)
//  Index  7 : mont  (réservé)
//  Index  8 : nbre  situation '11b'  (Inactive – abandonnée)
//  Index  9 : mont  (réservé)
//  Index 10 : nbre  situation '31a'  (Soldée – réglée)
//  Index 11 : mont  (réservé)
//  Index 12 : nbre  situation '31b'  (Soldée – avoir)
//  Index 13 : mont  (réservé)
export function parseNbrMontAffaire(nbrMontAffaire: string | null | undefined): number[] {
    if (!nbrMontAffaire) return Array(14).fill(0);
    const p = nbrMontAffaire.split('|');
    return Array.from({ length: 14 }, (_, i) => parseInt(p[i] ?? '0', 10) || 0);
}
export function buildNbrMontAffaire(data: number[]): string {
    return data.map((v, i) => {
        // Index 0, 1       : compteurs (nbre '00x' et nbre '10x')
        // Index pairs ≥ 2  : compteurs (nbre situations '20x', '30x', '11a', '11b', '31a', '31b')
        // Index impairs ≥ 3: montants réservés
        if (i <= 1 || i % 2 === 0) return String(Math.round(v));
        return v.toFixed(2).replace('.', ',');
    }).join('|');
}

// ═════════════════════════════════════════════════════════════════
//  4. COMPTEURS SUIVI DU CHIFFRE d'AFFAIRE  (champ composite : suiviFac)
// ═════════════════════════════════════════════════════════════════
/** Désérialise abonne.suiviFac — Format : "nbr|mont|nbr|mont|..." (16 éléments) */
export function parseSuiviFac(suiviFac:string | null | undefined):string[] {
    if (!suiviFac) return Array(16).fill('0');
    const p = suiviFac.split('|');
    return Array.from({ length: 16 }, (_, i) => p[i] ?? '0');
}
/** Resérialise le tableau suiviFac en chaîne "|" pour stockage en base. */
export function buildSuiviFac(data:string[]):string {
    return data.join('|');
}

// ═════════════════════════════════════════════════════════════════
//  TYPE AGRÉGÉ
// ═════════════════════════════════════════════════════════════════
export type AbonneDerived = IdentiteDerived & LogoTextDerived & AbonnementDerived & StatutDerived;
export type Abonne = AbonneRaw & AbonneDerived;
export function convertAbonneRawToAbonne(raw: AbonneRaw): Abonne {
    return {
        ...raw,
        ...parseIdentite(raw.identite),
        ...parseLogoText(raw.logoText),
        ...parseAbonnement(raw.abonnement),
        ...parseStatut(raw.statut)
    };
}