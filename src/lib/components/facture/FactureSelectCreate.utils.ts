import type { Facture }            from '$lib/schemas/facture';
import type { FactureTotauxState } from '$lib/schemas/facture';
import { createFactureVide, parseTotal, serializeTotal, CELL_SEP, type TotalRow } from '$lib/schemas/facture';
import { parseStatut }             from '$lib/schemas/abonne';
import { regimeTvaFacture }        from '$lib/utils/regimeTva';
import { traitColSpan, traitLibTotaux, traitLibBasPage } from '$lib/utils/fonctionsTotaux';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type SelectCreateContext = {
    // Données
    statutRaw:  string;
    client:     {
        libClient:   string;
        adres:       string | null;
        adresCompl:  string | null;
        cp:          string | null;
        ville:       string | null;
        pays:        string | null;
        contNom:     string | null;
        contPhone:   string | null;
        temoinCee:   number | null;
        temoinTva:   number | null;
        temoinType:  number | null;
        soldeCredit: number | null;
    } | null;
    factures:   Facture[];
    totState:   FactureTotauxState;
    setDevisOptions: (options: string[]) => void;
    // Callbacks
    calNum:             ()                              => string;
    showAlerte:         (titre: string, msg: string)    => void;
    setModalFacture:    (mode: 'create' | 'update', action: string, facture: Facture) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Fonction principale
// ─────────────────────────────────────────────────────────────────────────────
export async function handleSelectCreate(e:Event, ctx:SelectCreateContext):Promise<void> {
    let val = (e.target as HTMLSelectElement).value;
    if (!val) return;
    (e.target as HTMLSelectElement).value = '';
    // ── Contrôle du Statut Fiscal ─────────────────────────────────
    const { statutFiscal0 } = parseStatut(ctx.statutRaw);
    if (statutFiscal0 === '') {
        ctx.showAlerte(
            'Saisies obligatoires',
            "Avant de Créer un Devis ou une Facture,<br>il convient au préalable de saisir votre Statut Fiscal<br>accessible par le menu <strong>'Mon Compte / Fiscalité'</strong>."
        );
        return;
    }
    // ── Données client figées à l'émission ───────────────────────
    const cli  = ctx.client;
    const pays0 = cli?.pays        ?? '';
    const cee0  = cli?.temoinCee   ?? 0;
    const tva0  = cli?.temoinTva   ?? 0;
    const clientData = {
        libClient0:   cli?.libClient   ?? '',
        adres0:       cli?.adres       ?? '',
        complAdres0:  cli?.adresCompl  ?? '',
        cp0:          cli?.cp          ?? '',
        ville0:       cli?.ville       ?? '',
        pays0,
        contNom0:     cli?.contNom     ?? '',
        contPhone0:   cli?.contPhone   ?? '',
        cee0,
        tva0,
        typeCli0:     cli?.temoinType  ?? 0,
        soldeCredit0: cli?.soldeCredit ?? 0,
    };
    // ── Initialisation de la nouvelle occurrence ──────────────────
    const newFacture = createFactureVide({
        client:   JSON.stringify(clientData),
        refDevis: '',
        codeType: val === 'Devis' ? 10 : 30,
        refFac:   val === 'Devis' ? 'D' + ctx.calNum() : 'FB' + ctx.calNum(),
    });
    if (val !== 'Devis') {
        if (val.startsWith('Facture par copie du Devis ')) {
            const refDevis = val.replace('Facture par copie du Devis ', '').trim();
            newFacture.refDevis = refDevis;
            // Facture par copie du devis → positionner le select
            ctx.setDevisOptions(
                (ctx.factures
                    .filter(f => f.codeType === 10)
                    .map(f => f.refFac)
                    .filter(Boolean)) as string[]
            );
            const devis = ctx.factures.find(f => f.refFac === refDevis);
            if (devis) {
                newFacture.ligne = devis.ligne ?? '';
                newFacture.total = devis.total ?? '';
            }
        }
        val = 'Facture';
    }
    // ── Attribution du régime TVA ─────────────────────────────────
    newFacture.regimeTva = regimeTvaFacture(pays0, cee0, tva0, ctx.statutRaw);
    // ── Détermination si un Acompte reste à Imputer sur la 1ère facture suivant la Facture d'Acompte (réglée et non-encore imputée) ───────────────
    if (newFacture.codeType === 30) {
        ctx.totState.imputAcomp0 = '1';
        ctx.totState.acompteId0  = 0;
        const indFac = ctx.factures.findIndex(
            (f) => f.codeType === 20 && f.statutCode === 21 && !f.refPre
        );
        if (indFac !== -1) {
            const fAcomp = ctx.factures[indFac];
            if (newFacture.regimeTva !== 'B') { // Franchise Tva ---
                ctx.totState.imputAcomp0  = '2';
                newFacture.acompMont      = String(fAcomp.totRegl     ?? '0,00');
                ctx.totState.acompPresta0 = String(fAcomp.totPrestaHt ?? '0,00');
                ctx.totState.acompVente0  = String(fAcomp.totVenteHt  ?? '0,00');
            } else {  // Imposition Tva ----------
                ctx.totState.imputAcomp0  = '3';
                if (fAcomp.total) {
                    const arrAcompte = fAcomp.total.split('|');
                    for (const row of arrAcompte) {
                        const lig = row.split('¤');
                        if (lig[0] !== undefined && lig[2] !== undefined) {
                            ctx.totState.acompMontArray0.push(`${lig[0]}¤${lig[2]}`);
                        }
                    }
                    newFacture.acompMont = ctx.totState.acompMontArray0.join('|');
                }
            }
            (newFacture as Record<string, unknown>).refPre = fAcomp.refFac;
            ctx.totState.acompteId0 = fAcomp.id;
        }
    }
    // ── Franchise Tva : Imputation de l'Acompte sur les Totaux Finaux ──────────────────────────
    if (newFacture.refDevis && ctx.totState.imputAcomp0 === '2') {
        ctx.totState.totBrutTtc0 = String(newFacture.totTtc ?? '0,00');
        const brut  = parseFloat(String(ctx.totState.totBrutTtc0).replace(',', '.'));
        const acomp = parseFloat(String(newFacture.acompMont ?? '0').replace(',', '.'));
        if (!isNaN(brut) && !isNaN(acomp)) {
            newFacture.totTtc = (brut - acomp).toFixed(2).replace('.', ',') as unknown as number | null;
        }
    }
    // ── Imposition Tva : Imputation de l'Acompte sur les lignes de totalisation  ────────────────────────
    let totPresta = 0;
    let totVente  = 0;
    if (newFacture.refDevis && ctx.totState.imputAcomp0 === '3') {
        const totalRows = parseTotal(newFacture.total);
        if (Array.isArray(totalRows) && totalRows.length > 0) {
            let totTtc = 0;
            const acompItems: { tauxTva0:string; montAcompHt:string }[] =
                ctx.totState.acompMontArray0.map((item:string) => {
                    const parts = item.split(CELL_SEP);
                    return { tauxTva0:parts[0] ?? '', montAcompHt:parts[1] ?? '0,00' };
                });
            const updatedRows: TotalRow[] = totalRows.map((row: TotalRow) => {
                const typeSlice = row.typeTotalisation0.slice(4, 6);
                if (typeSlice === '00' || typeSlice === '11') {
                    const taux      = row.typeTotalisation0.slice(0, 4);
                    const acompItem = acompItems.find((a) => a.tauxTva0 === taux);
                    const updatedRow = { ...row };
                    if (acompItem) {
                        updatedRow.acompteImputation0 = acompItem.montAcompHt;
                    }
                    const brut = parseFloat(updatedRow.montBrut0.replace(',', '.'));
                    const impl = parseFloat(updatedRow.acompteImputation0.replace(',', '.'));
                    const net  = brut - (isNaN(impl) ? 0 : impl);
                    updatedRow.montHt0 = net.toFixed(2).replace('.', ',');
                    if (typeSlice === '00') totVente  += net;
                    else                    totPresta += net;
                    const tauxNum = parseFloat(taux.replace(',', '.'));
                    const tva     = isNaN(tauxNum) ? 0 : (net * tauxNum) / 100;
                    updatedRow.montTva0 = tva.toFixed(2).replace('.', ',');
                    const ttc = net + tva;
                    updatedRow.montTtc0 = ttc.toFixed(2).replace('.', ',');
                    totTtc += ttc;
                    return updatedRow;
                } else {
                    totTtc += parseFloat(row.montTtc0.replace(',', '.')) || 0;
                    return row;
                }
            });
            updatedRows.sort((a, b) =>
                a.typeTotalisation0.slice(4, 6).localeCompare(b.typeTotalisation0.slice(4, 6))
            );
            (newFacture as Record<string, unknown>).total  = serializeTotal(updatedRows);
            (newFacture as Record<string, unknown>).totTtc = totTtc.toFixed(2).replace('.', ',');
        }
    }
    // ── Montants Prestation et Vente ──────────────────────────────
    let indDev      = -1;
    let indFacAcomp = -1;
    if (newFacture.refDevis) {
        indDev      = ctx.factures.findIndex((f) => f.refFac === newFacture.refDevis);
        indFacAcomp = ctx.factures.findIndex((f) => f.codeType === 20 && f.statutCode === 21 && !f.refDevis);
    }
    switch (ctx.totState.imputAcomp0) {
        case '0':
        case '1':
            (newFacture as Record<string, unknown>).totPrestaHt = '0,00';
            (newFacture as Record<string, unknown>).totVenteHt  = '0,00';
            break;
        case '2':
            if (indDev === -1) {
                (newFacture as Record<string, unknown>).totPrestaHt = '0,00';
                (newFacture as Record<string, unknown>).totVenteHt  = '0,00';
            } else {
                const fDev  = ctx.factures[indDev];
                const fAcmp = indFacAcomp !== -1 ? ctx.factures[indFacAcomp] : null;
                const sub   = (a: string | null, b: string | null) => (parseFloat(String(a ?? '0').replace(',', '.')) - parseFloat(String(b ?? '0').replace(',', '.'))).toFixed(2).replace('.', ',');
                (newFacture as Record<string, unknown>).totPrestaHt = sub(String(fDev.totPrestaHt), fAcmp ? String(fAcmp.totPrestaHt) : '0,00');
                (newFacture as Record<string, unknown>).totVenteHt  = sub(String(fDev.totVenteHt),  fAcmp ? String(fAcmp.totVenteHt)  : '0,00');
            }
            break;
        case '3':
            if (indDev === -1) {
                (newFacture as Record<string, unknown>).totPrestaHt = '0,00';
                (newFacture as Record<string, unknown>).totVenteHt  = '0,00';
            } else {
                (newFacture as Record<string, unknown>).totPrestaHt = totPresta.toFixed(2).replace('.', ',');
                (newFacture as Record<string, unknown>).totVenteHt  = totVente.toFixed(2).replace('.', ',');
            }
            break;
    }
    // ── Ouverture de la ModalFacture ──────────────────────────────
    ctx.setModalFacture('create', val, newFacture as Facture);
    if (indDev !== -1) {
        traitColSpan(newFacture as Facture,  ctx.totState);
        traitLibTotaux(newFacture as Facture, ctx.totState);
    }
    traitLibBasPage(newFacture as Facture, ctx.totState);
}