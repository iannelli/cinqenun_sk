import type { Facture }  from '$lib/schemas/facture';
import type { Abonne }   from '$lib/schemas/abonne';
import type { Affaire }  from '$lib/schemas/affaire';

// ─────────────────────────────────────────────────────────────────────────────
// Contexte partagé
// ─────────────────────────────────────────────────────────────────────────────
export type SupprAnnulContext = {
    factures:           Facture[];
    abonne:             Abonne;
    affaire:            Affaire;
    facAcompteToUpdate: Facture | null;
    showAlerte:         (titre:string, msg:string) => void;
    showToast:          (message:string) => void;
    onSuccess:          () => Promise<void>;
};
export type DeleteSituation =
    | { type: 'devis-simple' }
    | { type: 'devis-seul';   fbId: number }
    | { type: 'devis-et-fb';  fbId: number }
    | { type: 'fb-simple' }
    | { type: 'fb-avec-devis';      devId: number }
    | { type: 'fb-avec-facAcompte'; faId: number };
export type AnnulationSituation =
    | { type: 'acompte-simple' }
    | { type: 'acompte-avec-fb';           fbId: number }
    | { type: 'validee-simple' }
    | { type: 'validee-avec-facAcompte';   faId: number };

// ─────────────────────────────────────────────────────────────────────────────
// Suppression Devis / Facture Brouillon
// ─────────────────────────────────────────────────────────────────────────────
export async function deleteFacture(f: Facture, ctx: SupprAnnulContext, situation: DeleteSituation): Promise<void> {
    const fd = new FormData();
    fd.append('factureId', String(f.id));
    fd.append('affaireId', String(ctx.affaire.id));
    fd.append('situation', JSON.stringify(situation));

    const resp = await fetch('?/deleteFacture', { method: 'POST', body: fd });
    if (!resp.ok) {
        let msg = `Erreur HTTP ${resp.status}`;
        try {
            const data = JSON.parse(await resp.text());
            if (data?.message) msg = data.message;
        } catch { /* garder le message par défaut */ }
        ctx.showAlerte('Erreur lors de la suppression', msg);
        return;
    }

    ctx.showToast(f.codeType === 10 ? 'Devis supprimé' : 'Facture supprimée');
    await ctx.onSuccess();
}


// ─────────────────────────────────────────────────────────────────────────────
// Annulation d'une Facture validée (Acompte ou Facture)
// ─────────────────────────────────────────────────────────────────────────────
export async function annulationFacture(f: Facture, ctx: SupprAnnulContext, situation: AnnulationSituation): Promise<void> {
    const fd = new FormData();
    fd.append('factureId', String(f.id));
    fd.append('affaireId', String(ctx.affaire.id));
    fd.append('situation', JSON.stringify(situation));
    const resp = await fetch('?/annulationFacture', { method: 'POST', body: fd });
    if (!resp.ok) {
        let msg = `Erreur HTTP ${resp.status}`;
        try {
            const data = JSON.parse(await resp.text());
            if (data?.message) msg = data.message;
        } catch { /* garder le message par défaut */ }
        ctx.showAlerte("Erreur lors de l'annulation", msg);
        return;
    }
    ctx.showToast(f.codeType === 20 ? "Facture d'Acompte annulée" : 'Facture annulée');
    await ctx.onSuccess();
}