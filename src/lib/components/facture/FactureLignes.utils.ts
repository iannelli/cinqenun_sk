/** Fonctions utilitaires de FactureLignes.svelte */
import { parseLigne, serializeLigne, type LigneCell } from '$lib/schemas/facture';
import type { Facture } from '$lib/schemas/facture';

// ─────────────────────────────────────────────────────────────────────────────
// Interface — état de la vue lignes
// ─────────────────────────────────────────────────────────────────────────────
export interface LigneSelectState {
    setNat0:             (v: string)  => void;
    setUniteVu:          (v: boolean) => void;
    setPuQteBaseVu:      (v: boolean) => void;
    setForfaitVu:        (v: boolean) => void;
    setRemMontVu:        (v: boolean) => void;
    setFraisDebourDcVu:  (v: boolean) => void;
    setTvaVu:            (v: boolean) => void;
    setLibFraisDebourDc: (v: string)  => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sélection Nature
// ─────────────────────────────────────────────────────────────────────────────
export function selectNature(e: Event, ligne: LigneCell, st: LigneSelectState): void {
    const nat0 = (e.target as HTMLSelectElement).value;
    st.setNat0(nat0);
    switch (nat0) {
        case 'Vente':
        case 'Prestation':
            st.setUniteVu(true);
            st.setTvaVu(false);
            break;
        case 'Commentaire':
            ligne.unite0        = '';
            ligne.prixUnitaire0 = '0,00';
            ligne.quantite0     = '0,00';
            ligne.baseHt0       = '0,00';
            ligne.pourRemise0   = '0';
            ligne.remise0       = '0,00';
            st.setUniteVu(false);
            st.setPuQteBaseVu(false);
            st.setForfaitVu(false);
            st.setRemMontVu(false);
            st.setTvaVu(false);
            break;
        case "Frais `déplacement`":
        case "Frais `départ`":
            ligne.unite0        = '';
            ligne.prixUnitaire0 = '0,00';
            ligne.quantite0     = '0,00';
            ligne.baseHt0       = '0,00';
            ligne.pourRemise0   = '0';
            ligne.remise0       = '0,00';
            st.setUniteVu(false);
            st.setPuQteBaseVu(false);
            st.setForfaitVu(false);
            st.setRemMontVu(false);
            st.setLibFraisDebourDc('Frais');
            st.setFraisDebourDcVu(true);
            st.setTvaVu(true);
            break;
        case 'Débours':
        case 'Débit Débours':
        case 'Crédit Débours':
            ligne.unite0 = '';
            st.setPuQteBaseVu(false);
            st.setForfaitVu(false);
            st.setRemMontVu(false);
            st.setLibFraisDebourDc(
                (nat0 as string) === 'Débit Débours'  ? 'Débit'
              : (nat0 as string) === 'Crédit Débours' ? 'Crédit'
              : 'montant Ttc'
            );
            st.setFraisDebourDcVu(true);
            st.setTvaVu(false);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sélection Unité
// ─────────────────────────────────────────────────────────────────────────────
export function selectUnite(e: Event, ligne: LigneCell, nat0: string, st: LigneSelectState): void {
    const uni0          = (e.target as HTMLSelectElement).value;
    ligne.prixUnitaire0 = '0,00';
    ligne.quantite0     = '0,00';
    ligne.baseHt0       = '0,00';
    ligne.pourRemise0   = '0';
    ligne.remise0       = '0,00';
    ligne.montantHt0    = '0,00';
    if (uni0 === 'forfait') {
        st.setPuQteBaseVu(false);
        st.setForfaitVu(true);
    } else {
        st.setPuQteBaseVu(true);
        st.setForfaitVu(false);
    }
    st.setRemMontVu(true);
    st.setTvaVu(false);
    if (nat0 !== 'Commentaire' && nat0 !== 'Débours (ttc)') {
        st.setTvaVu(true);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Vérification de la saisie d'une ligne
// ─────────────────────────────────────────────────────────────────────────────
export interface VerifSaisieState {
    uniteVu:    boolean;
    puQteBaseVu: boolean;
    remMontVu:  boolean;
    tvaVu:      boolean;
    showAlert:  (titre: string, message: string) => void;
    setLibHtmlLigne: (v: string) => void;
}
export function verifSaisie(ligne: LigneCell, st: VerifSaisieState): boolean {
    const errs: string[] = [];
    if (!ligne.nature0)
        errs.push('• Une Nature de prestation doit être sélectionnée.');
    if (st.uniteVu && (!ligne.unite0 || ligne.unite0 === ''))
        errs.push('• Une Unité doit être sélectionnée.');
    if (st.puQteBaseVu && parseFloat(String(ligne.prixUnitaire0).replace(',', '.')) <= 0)
        errs.push('• Un Prix Unitaire doit être saisi.');
    if (st.puQteBaseVu && parseFloat(String(ligne.quantite0).replace(',', '.')) <= 0)
        errs.push('• Une Quantité doit être saisie.');
    if (st.remMontVu && ligne.pourRemise0 && Number(ligne.pourRemise0) > 100)
        errs.push('• Le Taux de Remise ne peut être supérieur à 100.');
    if (st.tvaVu && ligne.tauxTva0 === '')
        errs.push('• Un Taux de TVA doit être sélectionné.');
    if (errs.length > 0) {
        st.showAlert('Saisies obligatoires', errs.join('<br>'));
        return false;
    }
    // Récupérer le contenu HTML de l'éditeur
    const editor      = document.getElementById('editor') as HTMLElement | null;
    const colorPicker = document.getElementById('colorPicker') as HTMLInputElement | null;
    if (editor) {
        const html = editor.innerHTML.replace(/font color="([^"]+)"/g, "font color='$1'");
        ligne.textHtml0 = html;
        st.setLibHtmlLigne(html);
    }
    if (colorPicker) colorPicker.value = '#000000';
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Déplacement d'une ligne dans le tableau
// ─────────────────────────────────────────────────────────────────────────────
export function moveLigne(
    i: number,
    direction: number,
    facture: Facture,
    setLignesArray: (v: LigneCell[]) => void
): void {
    const tableArray = [...(parseLigne(facture.ligne) ?? [])];
    const part = tableArray.splice(i, 1);
    const pos  = Math.min(tableArray.length, Math.max(0, i + direction));
    tableArray.splice(pos, 0, ...part);
    facture.ligne = serializeLigne(tableArray);
    setLignesArray([...tableArray]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Calcul BaseHT : lit directement depuis ligne (sans event)
// ─────────────────────────────────────────────────────────────────────────────
export function calBaseHt(fieldId:'idPu'|'idQte'|'idFor'|'idDcFrais', ligne:LigneCell): void {
    const pu  = parseFloat(String(ligne.prixUnitaire0).replace(',', '.')) || 0;
    const qte = parseFloat(String(ligne.quantite0).replace(',', '.'))     || 0;
    switch (fieldId) {
        case 'idPu':
        case 'idQte':
            (ligne as Record<string, string>).baseHt0 = (pu * qte).toFixed(2).replace('.', ',');
            break;
        case 'idDcFrais':
            // ── Débours/Frais/Débit/Crédit : montant saisi directement ──
            (ligne as Record<string, string>).baseHt0       = ligne.montantHt0;
            (ligne as Record<string, string>).remise0       = '0,00';
            (ligne as Record<string, string>).prixUnitaire0 = '';
            (ligne as Record<string, string>).quantite0     = '';
            return;
    };
    // ── Calcul commun PU/Qte/Forfait ─────────────────────────────
    const base = parseFloat(String(ligne.baseHt0).replace(',', '.')) || 0;
    const rem  = Number(ligne.pourRemise0) || 0;
    if (rem > 0) {
        const remise = (base * rem) / 100;
        (ligne as Record<string, string>).remise0    = remise.toFixed(2).replace('.', ',');
        (ligne as Record<string, string>).montantHt0 = (base - remise).toFixed(2).replace('.', ',');
    } else {
        (ligne as Record<string, string>).remise0    = '0,00';
        (ligne as Record<string, string>).montantHt0 = base.toFixed(2).replace('.', ',');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Calcul Montant HT : après saisie du taux de remise
// ─────────────────────────────────────────────────────────────────────────────
export function calMontHt(ligne: LigneCell): void {
    const base = parseFloat(String(ligne.baseHt0).replace(',', '.'))     || 0;
    const rem  = Number(ligne.pourRemise0) || 0;
    const remise = rem > 0 ? (base * rem) / 100 : 0;
    (ligne as Record<string, string>).remise0    = remise.toFixed(2).replace('.', ',');
    (ligne as Record<string, string>).montantHt0 = (base - remise).toFixed(2).replace('.', ',');
}
