/**
 * Gestion du référencement d'une ligne de facturation (table Tarif)
 */
import { tick }                                                     from 'svelte';
import { invalidate }                                               from '$app/navigation';
import { type Facture, parseLigne, serializeLigne, type LigneCell } from '$lib/schemas/facture';
import type { Tarif }                                               from '$lib/schemas/tarif';

// ─────────────────────────────────────────────────────────────────────────────
// Interface — état de la gestion Tarif
// ─────────────────────────────────────────────────────────────────────────────
export interface TarifGestionState {
    // Données ligne courante
    getLigne:                () => LigneCell;
    getLigneEditIndex:       () => number;
    getFacture:              () => Facture | null;
    setFacture:              (f: Facture) => void;
    getLibHtmlLigne:         () => string;
    setTarifId0:             (v: string) => void;
    setLignesArray:          (v: LigneCell[]) => void;
    // Modal tarif
    setTarifModalVisible:    (v: boolean) => void;
    setTarifModalTitre:      (v: string)  => void;
    setTarifModalMessage1:   (v: string)  => void;
    setTarifModalMessage2:   (v: string)  => void;
    setTarifModalBtnOui:     (v: string)  => void;
    setTarifMotCleInput:     (v: string)  => void;
    setTarifTrouve:          (v: Tarif | null) => void;
    setTarifIsModification:  (v: boolean) => void;
    getTarifMotCleInput:     () => string;
    getTarifTrouve:          () => Tarif | null;
    getTarifIsModification:  () => boolean;
    getLigneInitial:         () => LigneCell | null;
    // Toast
    showToast:               (message: string, succes?: boolean) => void;
    // Alerte
    showAlert:               (titre: string, message: string) => void;
    // Reset
    setLigneEditIndex:       (v: number) => void;
    setDivSaisieVu:          (v: boolean) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparaison ligne de facturation vs Occurrence de Tarif : Vérifie s'il existe une différence entre le tarif sélectionné et la ligne
// ─────────────────────────────────────────────────────────────────────────────
export function ligneVsTarif(ligne: LigneCell, t: Tarif): boolean {
    const puStr  = t.prixUnite ? String(t.prixUnite).replace('.', ',') : '0,00';
    const tvaStr = t.tauxTva   ? String(t.tauxTva).replace('.', ',')   : '';
    return (
        t.nature   !== ligne.nature0       ||
        t.unite    !== ligne.unite0        ||
        puStr      !== ligne.prixUnitaire0 ||
        tvaStr     !== ligne.tauxTva0      ||
        t.textHtml !== ligne.textHtml0        // ← ajout
    );
}
// Fonction de comparaison lors d'une création de Ligne de Facturation
function ligneChangedFromInitial(ligne: LigneCell, initial: LigneCell): boolean {
    return (
        ligne.nature0       !== initial.nature0       ||
        ligne.unite0        !== initial.unite0        ||
        ligne.prixUnitaire0 !== initial.prixUnitaire0 ||
        ligne.tauxTva0      !== initial.tauxTva0      ||
        ligne.textHtml0     !== initial.textHtml0
    );
}
// ─────────────────────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────────────────────
export function createShowToast(setToastMessage:(v: string) =>void, setToastSucces:(v: boolean)=>void, setToastVisible:(v:boolean)=>void): (message:string, succes?:boolean)=>void {
    return (message: string, succes = true) => {
        setToastMessage(message);
        setToastSucces(succes);
        setToastVisible(true);
        setTimeout(() => setToastVisible(false), 3000);
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lancer la gestion tarif
// ─────────────────────────────────────────────────────────────────────────────
/** Lance le flux de gestion tarif après validation de la ligne */
export async function lancerGestionTarif(tarifs:Tarif[], ligne:LigneCell, st:TarifGestionState): Promise<void> {
    const isModification = st.getLigneEditIndex() >= 0;
    st.setTarifIsModification(isModification);
    st.setDivSaisieVu(false);
    await tick();
    const tarifId         = Number(ligne.tarifId0);
    const isTarifExistant = tarifId > 0;
    if (isTarifExistant) {
        const t = tarifs.find((t: Tarif) => t.id === tarifId);
        if (!t) {
            st.setLigneEditIndex(-1);
            return;
        }
        if (isModification) {
            // Édition : on compare contre l'état initial de la ligne
            const initial = st.getLigneInitial();
            if (!initial || !ligneChangedFromInitial(ligne, initial)) {
                st.setLigneEditIndex(-1);
                return;
            }
        } else {
            // Nouvelle ligne depuis tarif : on compare contre le tarif
            if (!ligneVsTarif(ligne, t)) {
                st.setLigneEditIndex(-1);
                return;
            }
        }
        st.setTarifTrouve(t);
        st.setTarifMotCleInput(t.motCle);
    } else {
        st.setTarifTrouve(null);
        st.setTarifMotCleInput('');
    }
    st.setTarifModalTitre(isTarifExistant
        ? "Modification du Tarif de Référence"
        : "Création d'un Tarif de Référence");
    st.setTarifModalMessage1(isTarifExistant
        ? "Les modifications apportées à la ligne de facturation peuvent être reportées sur ce Tarif.<br>Vous pouvez également modifier le Mot-Clé."
        : "A la suite de la création de la ligne de facturation, vous pouvez la référencer en Tarif.<br>Dans ce cas, la saisie d'un Mot-Clé est obligatoire.");
    st.setTarifModalMessage2(isTarifExistant
        ? "Souhaitez-vous mettre à jour ce Tarif ?"
        : "Souhaitez-vous créer ce Tarif ?");
    st.setTarifModalBtnOui(isTarifExistant ? "Modifier" : "Créer");
    st.setTarifModalVisible(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Bouton 'Créer' ou 'Modifier' : Retour de Saisie du Tarif 
// ─────────────────────────────────────────────────────────────────────────────
export async function handleTarifAction(pathname:string, ligne:LigneCell, st:TarifGestionState): Promise<void> {
        const motCle = st.getTarifMotCleInput().trim();
        if (!motCle) {
            st.showAlert('Saisie obligatoire', 'Un Mot-Clé doit être saisi.');
            return;
        }
        const tarifTrouve = st.getTarifTrouve();
        if (st.getTarifIsModification() && tarifTrouve) {
            await mettreAJourTarif(pathname, ligne, st);
        } else {
            await creerTarif(motCle, pathname, ligne, st);
        }
        st.setTarifModalVisible(false);
        st.setLigneEditIndex(-1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Bouton 'Annuler'
// ─────────────────────────────────────────────────────────────────────────────
export function handleTarifAnnuler (st:TarifGestionState): void {
    st.setTarifModalVisible(false);
    st.setLigneEditIndex(-1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Créer une occurrence de Tarif en base de données
// ─────────────────────────────────────────────────────────────────────────────
export async function creerTarif(motCle:string, pathname:string, ligne:LigneCell, st:TarifGestionState): Promise<void> {
    const fd = new FormData();
    fd.append('motCle',    motCle);
    fd.append('textHtml',  st.getLibHtmlLigne());
    fd.append('nature',    ligne.nature0);
    fd.append('unite',     ligne.unite0);
    fd.append('prixUnite', String(ligne.prixUnitaire0));
    fd.append('tauxTva',   String(ligne.tauxTva0));
    try {
        const resp = await fetch(pathname + '?/createTarif', { method: 'POST', body: fd });
        const text = await resp.text();
        if (resp.ok) {
            try {
                const result = JSON.parse(text);
                let newId: number | null = null;
                if (typeof result?.data === 'string') {
                    const devalued = JSON.parse(result.data);
                    const rootObj  = devalued[0];
                    newId = rootObj?.id !== undefined ? devalued[rootObj.id] : null;
                } else {
                    newId = result?.data?.id ?? null;
                }
                if (newId) {
                    st.setTarifId0(String(newId));
                    ligne.tarifId0 = String(newId);
                    const facture  = st.getFacture();
                    if (facture) {
                        const tableArray = [...(parseLigne(facture.ligne) ?? [])];
                        const idx        = st.getLigneEditIndex() >= 0 ? st.getLigneEditIndex() : tableArray.length - 1;
                        if (tableArray[idx]) {
                            tableArray[idx] = { ...tableArray[idx], tarifId0: String(newId) };
                            facture.ligne   = serializeLigne(tableArray);
                            st.setFacture(facture);
                            st.setLignesArray([...tableArray]);
                        }
                    }
                }
            } catch (e) {
                console.error('creerTarif parse error:', e);
            }
            st.showToast('Tarif créé avec succès ✓');
            await invalidate('app:tarifs');
        } else {
            st.showToast(`Échec de la création (HTTP ${resp.status})`, false);
        }
    } catch (err) {
        console.error('creerTarif error:', err);
        st.showToast('Erreur réseau lors de la création du tarif', false);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mettre à jour une occurrence de Tarif en Base de données
// ─────────────────────────────────────────────────────────────────────────────
export async function mettreAJourTarif(pathname: string, ligne: LigneCell, st: TarifGestionState): Promise<void> {
    const tarifTrouve = st.getTarifTrouve();
    if (!tarifTrouve) return;
    const fd = new FormData();
    fd.append('id',        String(tarifTrouve.id));
    fd.append('textHtml',  st.getLibHtmlLigne());
    fd.append('nature',    ligne.nature0);
    fd.append('unite',     ligne.unite0);
    fd.append('prixUnite', String(ligne.prixUnitaire0));
    fd.append('tauxTva',   String(ligne.tauxTva0));
    const resp = await fetch(pathname + '?/updateTarif', { method: 'POST', body: fd });
    if (resp.ok) {
        st.showToast('Tarif mis à jour avec succès ✓');
        await invalidate('app:tarifs');   // ← ajout
    } else {
        st.showToast('Échec de la mise à jour du tarif', false);
    }
}