/**  * Calcule la couleur et le statut d'une facture selon sa date d'échéance  */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface DateEcheanceState {
    date0:        string;   // format jj/mm/aaaa
    couleurHtml0: string;   // ex. '#66C909'
}
export interface FactureStatutState {
    codeType:   number | string;
    refFac:     string;
    statutCode: number | string;
    statut:     string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
/** Convertit une date 'jj/mm/aaaa' en objet Date */
function parseJJMMAAAA(dateStr: string): Date | null {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts.map(Number);
    if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
    return new Date(y, m - 1, d);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fonction principale
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Calcule la couleur HTML et le statut de la facture en fonction de la date d'échéance (format jj/mm/aaaa).
 * @param dateEcheanceStr    - Date d'échéance au format 'jj/mm/aaaa'
 * @param dateEcheanceSchema - Objet muté directement (date0, couleurHtml0)
 * @param facture            - Objet muté directement (statutCode, statut)
 */
export function colorStatut(
    dateEcheanceStr: string,
    dateEcheanceSchema: DateEcheanceState,
    facture: FactureStatutState
): void {
    // ── 1. Calcul du nombre de jours restants ─────────────────────
    const dateEch = parseJJMMAAAA(dateEcheanceStr);
    if (!dateEch) return;
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const echeance = Math.ceil(
        (dateEch.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)
    );
    dateEcheanceSchema.date0 = dateEcheanceStr;
    // ── 2. Lookup table : seuils → couleur + code de base ─────────
    const SEUILS = [
        { test: (d:number) => d >   20,              couleur:'#66C909', base:3  },
        { test: (d:number) => d >=  10 && d <= 20,   couleur:'#FC9B05', base:4  },
        { test: (d:number) => d >=   0 && d <  10,   couleur:'#FC6A05', base:5  },
        { test: (d:number) => d <    0,              couleur:'#FC1B05', base:6  },
    ];
    const seuil = SEUILS.find(s => s.test(echeance));
    if (!seuil) return;
    const { couleur, base } = seuil;
    dateEcheanceSchema.couleurHtml0 = couleur;
    const mark = (lib: string) =>
        `<mark style='background:white;color:${couleur}'>${lib} <strong>${dateEcheanceSchema.date0}`;

    const codeType = String(facture.codeType);
    if (codeType === '10') {
        facture.statutCode = base;
        facture.statut     = mark('Echéance');
    }
    if (codeType === '30') {
        const isBrouillon  = String(facture.refFac).slice(0, 2) === 'FB';
        facture.statutCode = base + (isBrouillon ? 10 : 20);
        facture.statut     = mark(isBrouillon ? 'Facture brouillon Echéance' : 'Facture Echéance');
    }
}
