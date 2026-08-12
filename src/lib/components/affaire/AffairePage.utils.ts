import type { Facture } from '$lib/schemas/facture';
import type { Affaire } from '$lib/schemas/affaire';
import { deserialize } from '$app/forms';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type AlerteState = {
    setVisible: (v: boolean)  => void;
    setTitre:   (v: string)   => void;
    setMessage: (v: string)   => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Gestion d'une Affaire
// ─────────────────────────────────────────────────────────────────────────────
// ─── Vérification suppression via fetch ──────────────────────────
export async function checkFacturesValideesFetch(
    affaireId: number,
    callbacks: {
        onBloquee:   (titre: string, message: string) => void;
        onSupprimable: (affaire: Affaire) => void;
    },
    affaire: Affaire
): Promise<void> {
    const fd = new FormData();
    fd.append('affaireId', String(affaireId));
    try {
        const response = await fetch('?/checkFacturesValidees', { method: 'POST', body: fd });
        const result   = deserialize(await response.text());
        if (result.type === 'success' && result.data?.hasFactureValidee) {
            callbacks.onBloquee(
                "Suppression de l'Affaire",
                "L'Affaire comportant au moins une facture validée, ne peut-être supprimée"
            );
        } else {
            callbacks.onSupprimable(affaire);
        }
    } catch {
        callbacks.onBloquee(
            'Erreur',
            "Impossible de vérifier le statut des factures de cette affaire."
        );
    }
}
export function checkAffaireSupprimable(
    factures: Facture[],
    callbacks: {
        setVisible: (v: boolean) => void;
        setTitre:   (v: string)  => void;
        setMessage: (v: string)  => void;
    }
): boolean {
    // Vérifier si au moins une facture validée (codeType !== 10 = pas un devis)
    const hasFactureValidee = factures.some(f => f.codeType !== 10 && f.statutCode > 20);
    if (hasFactureValidee) {
        callbacks.setTitre("Suppression de l'Affaire");
        callbacks.setMessage("L'Affaire comportant au moins une facture validée, ne peut-être supprimée.");
        callbacks.setVisible(true);
        return false;
    }
    return true;
}

// ─── Ouverture modale modification ───────────────────────────────
export function prepareUpdateAffaire(
    affaire: Affaire,
    setForm: (libAffaire: string, clientId: number) => void
): void {
    setForm(affaire.libAffaire, affaire.clientId ?? 0);
}
