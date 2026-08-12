// ─────────────────────────────────────────────────────────────────────────────
// Fonctions de formatage Date
// ─────────────────────────────────────────────────────────────────────────────

/** Formate une date en format français DD/MM/YYYY */
export function formatDate(date: string | Date | null | undefined): string {
    if (!date) return '—';
    try {
        return new Date(date).toLocaleDateString('fr-FR');
    } catch {
        return '—';
    }
}
/** Formate une date au format français jj/mm/aaaa hh:mn */
export function formatDateHeure(date: Date): string {
    return String(date.getDate()).padStart(2, '0') + '/'
        + String(date.getMonth() + 1).padStart(2, '0') + '/'
        + date.getFullYear() + ' '
        + String(date.getHours()).padStart(2, '0') + ':'
        + String(date.getMinutes()).padStart(2, '0');
}
/** Calcule le nombre de jours écoulés entre une date passée (format 'jj/mm/aaaa') et la date du jour.
 ** Valeur positive=date échéance dans le futur, négative=date échéance dans le passé, 0=aujourd'hui.
 ** Retourne null si la date est invalide ou absente. */
export function calculerDelaiJours(dateJjMmAaaa: string | null | undefined):number | null {
    if (!dateJjMmAaaa) return null;
    const parts = dateJjMmAaaa.split('/');
    if (parts.length !== 3) return null;
    const [jour, mois, annee] = parts.map(Number);
    if (isNaN(jour) || isNaN(mois) || isNaN(annee)) return null;
    const dateRef = new Date(annee, mois - 1, jour);
    dateRef.setHours(0, 0, 0, 0);
    const dateAuj = new Date();
    dateAuj.setHours(0, 0, 0, 0);
    return Math.floor((dateRef.getTime() - dateAuj.getTime()) / (1000 * 60 * 60 * 24));
}


// ─────────────────────────────────────────────────────────────────────────────
// Fonctions de formatage Nombre
// ─────────────────────────────────────────────────────────────────────────────
/** Convertit tous les champs Prisma Decimal en number natif (les Decimal ne sont pas JSON-sérialisables par SvelteKit) */
export function dec(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    // Gérer le format français ('12,50') ET le format Decimal Prisma
    if (typeof v === 'string') {
        return parseFloat(v.replace(',', '.')) || null;
    }
    return Number(v) || null;
}

/** Formate un montant en format français avec 2 décimales */
export function formatMontant(val: unknown): string {
    if (val == null || val === '') return '—';
    const n = typeof val === 'string'
      ? parseFloat(val.replace(/[\s\u00A0\u202F]/g, '').replace(',', '.'))
      : Number(val);
    if (isNaN(n)) return '—';
    return n.toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).replace(/\u202F/g, '\u00A0');
}

/** Convertit un number Prisma (Decimal/float) en string format français '0,00' */
export function numberToFrStr(val: number | null | undefined): string {
    if (val == null) return '0,00';
    return val.toFixed(2).replace('.', ',');
}

/** Retourne le libellé du délai de paiement selon typeDelai et delai */
export function libFacTypeDelai(typeDelai:number, delai:number): string {
    switch (typeDelai) {
        case 1:  return delai + ' jours';
        case 2:  return '45j fin de mois';
        case 3:  return '45j date émission';
        case 4:  return '60j date émission';
        default: return '';
    }
}

/** Restitue un nombre avec un nombre de zéro à gauche */
export function convert(nbre:string|number, size:number=2): string {
    let s = String(nbre);
    while (s.length < size) {
        s = "0" + s;
    }
    return s;
}