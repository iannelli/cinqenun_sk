import type { LigneCell } from '$lib/schemas/facture';

// ─────────────────────────────────────────────────────────────────────────────
// Saisie numérique
// ─────────────────────────────────────────────────────────────────────────────
/** onkeyup — filtre, convertit les points en virgules */
export function numericDecimal(e: Event): void {
    const input = e.target as HTMLInputElement;
    input.value = input.value
        .replace('.', ',')
        .replace(/[^0-9,]/g, '');
}

/** onkeydown — restreint la saisie aux chiffres uniquement (avant insertion) */
export function onlyNumeric(e: KeyboardEvent): void {
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Home', 'End'];
    if (!/[0-9]/.test(e.key) && !allowedKeys.includes(e.key)) {
        e.preventDefault();
    }
}

/** onblur — formate à 2 décimales en format français :  Affecte '0,00' si vide. Déclenche le recalcul via callback optionnel. */
export function formatDecimalFr(
    e:     Event,
    ligne: LigneCell,
    field: 'prixUnitaire0' | 'quantite0' | 'baseHt0' | 'remise0' | 'montantHt0',
    onRecalcul?: () => void
): void {
    const input     = e.target as HTMLInputElement;
    const val       = parseFloat(input.value.replace(',', '.'));
    const formatted = (!input.value.trim() || isNaN(val)) ? '0,00' : val.toFixed(2).replace('.', ',');
    (ligne as Record<string, string>)[field] = formatted;
    input.value     = formatted;
    onRecalcul?.();
}

/** onblur — formate un entier positif : Affecte '0' si vide ou invalide. Déclenche le recalcul via callback optionnel.
*   Usage : taux de remise (%), nombre de jours, etc. */
export function formatEntier(
    e:     Event,
    ligne: LigneCell,
    field: 'pourRemise0',
    onRecalcul?: () => void
): void {
    const input = e.target as HTMLInputElement;
    const val    = parseInt(input.value, 10);
    const formatted = (!input.value.trim() || isNaN(val) || val < 0) ? '0' : String(val);
    (ligne as Record<string, string>)[field] = formatted;
    input.value  = formatted;
    onRecalcul?.();
}

/** onblur — formate un entier positif sur n'importe quel input. Affecte '0' si vide. Met à jour via callback. */
export function formatEntierInput(
    e: Event,
    onUpdate: (v: number) => void,
    onRecalcul?: () => void
): void {
    const input  = e.target as HTMLInputElement;
    const val    = parseInt(input.value, 10);
    const isVide = !input.value.trim() || isNaN(val) || val <= 0;
    input.value  = isVide ? '0' : String(val);
    onUpdate(isVide ? 0 : val);
    onRecalcul?.();
}
