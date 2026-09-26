import type { Prisma } from '@prisma/client';

// ═════════════════════════════════════════════════════════════════
//  SÉLECTEUR PRISMA
// ═════════════════════════════════════════════════════════════════
export const COMMUN_SELECT = {
    id:           true,
    numAbonne:    true,
    numCreance:   true,
    seuil:        true,
    tauxBce:      true,
    tauxInter:    true,
    indemForfait: true
} satisfies Prisma.CommunSelect;
export type CommunRaw = Prisma.CommunGetPayload<{ select: typeof COMMUN_SELECT }>;

// ═════════════════════════════════════════════════════════════════
//  DONNÉES DÉRIVÉES DU CHAMP COMPOSITE "seuil"
//  Format en base par exemple : "37500,85000,41250,93500,83600,203100" : 6 valeurs séparées par des virgules, dans cet ordre)
//  ─────────────────────────────────────────────────────────────────
//  Position 1 → seuilBasePresta0   : seuil de base — prestations      (ex. 37500)
//  Position 2 → seuilBaseVente0    : seuil de base — ventes           (ex. 85000)
//  Position 3 → seuilMajoPresta0   : seuil majoré — prestations       (ex. 41250)
//  Position 4 → seuilMajoVente0    : seuil majoré — ventes            (ex. 93500)
//  Position 5 → seuilStatutPresta0 : seuil de statut — prestations    (ex. 83600)
//  Position 6 → seuilStatutVente0  : seuil de statut — ventes         (ex. 203100)
// ═════════════════════════════════════════════════════════════════
/** Champs exploitables dans l'application, dérivés de commun.seuil */
export interface SeuilDetail {
    seuilBasePresta0:   number;
    seuilBaseVente0:    number;
    seuilMajoPresta0:   number;
    seuilMajoVente0:    number;
    seuilStatutPresta0: number;
    seuilStatutVente0:  number;
}
/** Décompose la chaîne commun.seuil en champs exploitables */
export function parseSeuil(seuil: string): SeuilDetail {
    const [
        seuilBasePresta0,
        seuilBaseVente0,
        seuilMajoPresta0,
        seuilMajoVente0,
        seuilStatutPresta0,
        seuilStatutVente0
    ] = seuil.split(',').map(v => Number(v.trim()));
    return {
        seuilBasePresta0,
        seuilBaseVente0,
        seuilMajoPresta0,
        seuilMajoVente0,
        seuilStatutPresta0,
        seuilStatutVente0
    };
}
/** Recompose la chaîne à enregistrer en base depuis les champs détaillés */
export function serializeSeuil(d: SeuilDetail): string {
    return [
        d.seuilBasePresta0,
        d.seuilBaseVente0,
        d.seuilMajoPresta0,
        d.seuilMajoVente0,
        d.seuilStatutPresta0,
        d.seuilStatutVente0
    ].join(',');
}

// ═════════════════════════════════════════════════════════════════
//  UTILITAIRES
// ═════════════════════════════════════════════════════════════════
// Génère un numéro d'abonné : année courante (4 car.) + compteur (4 car.) - Exemple : "20260012"
export function genererNumAbonne(compteur: number): string {
    const annee = new Date().getFullYear().toString();
    const num = compteur.toString().padStart(4, '0');
    return `${annee}${num}`;
}
// Retourne la date du jour au format jj/mm/aaaa
export function dateAujourdhui(): string {
    const now = new Date();
    const jj = now.getDate().toString().padStart(2, '0');
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const aaaa = now.getFullYear().toString();
    return `${jj}/${mm}/${aaaa}`;
}