import type { Prisma } from '@prisma/client';

// ═════════════════════════════════════════════════════════════════
//  SÉLECTEUR PRISMA
// ═════════════════════════════════════════════════════════════════
export const COMMUN_SELECT = {
    id: true,
    numAbonne: true,
    numCreance: true,
    seuil: true,
    tauxBce: true,
    tauxInter: true,
    indemForfait: true
} satisfies Prisma.communSelect;
export type CommunRaw = Prisma.communGetPayload<{ select: typeof COMMUN_SELECT }>;

// ═════════════════════════════════════════════════════════════════
//  DONNÉES DÉRIVÉES DU CHAMP COMPOSITE "seuil"
//  (à compléter si seuil est un champ composite pipe-separated)
// ═════════════════════════════════════════════════════════════════
// Pour l'instant, seuil, tauxBce, tauxInter sont utilisés tels quels.

// ═════════════════════════════════════════════════════════════════
//  UTILITAIRES
// ═════════════════════════════════════════════════════════════════
/**
 * Génère un numéro d'abonné : année courante (4 car.) + compteur (4 car.) - Exemple : "20260012"
 */
export function genererNumAbonne(compteur: number): string {
    const annee = new Date().getFullYear().toString();
    const num = compteur.toString().padStart(4, '0');
    return `${annee}${num}`;
}
/** Retourne la date du jour au format jj/mm/aaaa */
export function dateAujourdhui(): string {
    const now = new Date();
    const jj = now.getDate().toString().padStart(2, '0');
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const aaaa = now.getFullYear().toString();
    return `${jj}/${mm}/${aaaa}`;
}