/** Génération de documents PDF (Devis, Facture, Avoir) via pdfmake  et export Factur-X via pdf-lib. */
import pdfMake                              from 'pdfmake/build/pdfmake';
import { PDFDocument, AFRelationship }      from 'pdf-lib';
import { type Facture, type FactureTotauxState, parseLigne } from '$lib/schemas/facture';
import { type Abonne, parseLogoText }                        from '$lib/schemas/abonne';
import type { TDocumentDefinitions }        from 'pdfmake/interfaces';
import { generateXmlFacturX }               from '$lib/utils/generateFacturX';
import { formatMontant }                    from '$lib/utils/format';

// ─────────────────────────────────────────────────────────────────────────────
// Types JSON internes
// ─────────────────────────────────────────────────────────────────────────────
interface LignePdf {
    libel      : string;
    unite      : string;
    pu         : string;
    qte        : string;
    base       : string;
    remise     : string;
    montant    : string;
    tva        : string;
    libRemise  : string;
    puUnitNet  : string;
    montRemise : string;
    pourcent   : string;
}
interface TotalPdf {
    libel      : string;
    brut       : string;
    acompImput : string;
    montHt     : string;
    tauxTva    : string;
    montTva    : string;
    montTtc    : string;
}
interface LigTotPdf {
    libel : string;
    mont  : string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Contexte PDF (interface exportée)
// ─────────────────────────────────────────────────────────────────────────────
export interface PdfContext {
    facture      : Facture;
    abonne       : Abonne;
    totState     : FactureTotauxState;
    logoBase64?  : string | null;  // base64 PNG du logo abonné
    libAffaire   : string;
    nomPdfGauche : string;
    nomPdfDroite : string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers HTML → pdfmake
// ─────────────────────────────────────────────────────────────────────────────
// Formats pris en charge (Tiptap et ancien execCommand) : gras, italique, souligné, couleur, retours à la ligne.
type StylePdf = {
    bold?:       boolean;
    italics?:    boolean;
    decoration?: 'underline';
    color?:      string;
    fontSize?:   number;
};
type FragmentPdf = { text: string } & StylePdf;

// pdfmake n'accepte pas rgb(...) : conversion en #rrggbb
function normaliserCouleur(couleur: string): string {
    const c = couleur.trim();
    const m = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    return c;
}

// Taille Tiptap (em relatif, ex. '1.25em') → taille pdfmake absolue (pt), proportionnelle à la taille de base
function convertirTaille(taille: string, tailleBase: number): number | undefined {
    const v = parseFloat(taille);
    if (!(v > 0)) return undefined;
    if (taille.endsWith('em')) return Math.round(v * tailleBase * 10) / 10;
    if (taille.endsWith('px')) return Math.round(v * 0.75 * 10) / 10;
    if (taille.endsWith('pt')) return v;
    return undefined;
}

function htmlToPdfMake(html: string | null | undefined, tailleBase = 9): FragmentPdf[] | string {
    if (!html) return '';
    const doc    = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const racine = doc.body.firstElementChild;
    if (!racine) return '';
    const fragments: FragmentPdf[] = [];
    const parcourir = (parent: Element, style: StylePdf): void => {
        parent.childNodes.forEach((noeud) => {
            if (noeud.nodeType === Node.TEXT_NODE) {
                const texte = noeud.textContent ?? '';
                if (texte) fragments.push({ text: texte, ...style });
                return;
            }
            if (noeud.nodeType !== Node.ELEMENT_NODE) return;
            const el     = noeud as HTMLElement;
            const balise = el.tagName.toLowerCase();
            if (balise === 'br') {
                // Un <br> seul en fin de paragraphe ne crée pas de ligne supplémentaire
                if (el.nextSibling || parent === racine) fragments.push({ text: '\n' });
                return;
            }
            const s: StylePdf = { ...style };
            if (balise === 'strong' || balise === 'b') s.bold       = true;
            if (balise === 'em'     || balise === 'i') s.italics    = true;
            if (balise === 'u')                        s.decoration = 'underline';
            const couleurFont = balise === 'font' ? el.getAttribute('color') : null;
            if (couleurFont)    s.color = normaliserCouleur(couleurFont);
            if (el.style.color) s.color = normaliserCouleur(el.style.color);
            if (el.style.fontSize) {
                const t = convertirTaille(el.style.fontSize, tailleBase);
                if (t) s.fontSize = t;
            }
            // Chaque paragraphe (ou <div> de l'ancien format) commence sur une nouvelle ligne
            if ((balise === 'p' || balise === 'div') && fragments.length > 0) fragments.push({ text: '\n' });
            parcourir(el, s);
        });
    };
    parcourir(racine, {});
    return fragments.length > 0 ? fragments : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers calculs
// ─────────────────────────────────────────────────────────────────────────────
function extrairePourcentage(str: string): string {
    const match = str.match(/tva\s+(\d{1,2})(?:,(\d{1,2}))?%/i);
    if (!match) return '';
    const decimal = match[2] ? match[2].padEnd(2, '0') : '00';
    return `${parseInt(match[1], 10)}.${decimal}`;
}
function calPrixUnitNet(str: string, pu: string) {
    const pct = parseFloat(str.split('%')[0].replace(/[^0-9.]/g, ''));
    const puN = parseFloat(pu.replace(',', '.'));
    const rem = puN * (pct / 100);
    return {
        libRemise     : `Remise ${pct.toFixed(2)}%`,
        puUnitNet     : (puN - rem).toFixed(2),
        montantRemise : rem.toFixed(2),
    };
}
function parseClientArray(raw: string): string[] {
    // Rétrocompatibilité : détection du format JSON
    if (raw.trim().startsWith('{')) {
        try {
            const o = JSON.parse(raw) as Record<string, unknown>;
            return [
                String(o.libClient0   ?? ''),  // 0 : raison sociale
                String(o.adres0       ?? ''),  // 1 : adresse
                String(o.complAdres0  ?? ''),  // 2 : complément
                String(o.cp0          ?? ''),  // 3 : code postal
                String(o.ville0       ?? ''),  // 4 : ville
                String(o.pays0        ?? ''),  // 5 : pays
                String(o.contNom0     ?? ''),  // 6 : contact
                String(o.contPhone0   ?? ''),  // 7 : téléphone
            ];
        } catch { /* JSON invalide → on retombe sur le split */ }
    }
    return raw.split('¤');
}
function formatDateFr(d: Date | string | null | undefined): string {
    if (!d) return '';
    if (typeof d === 'string') return d;
    const j = String(d.getDate()).padStart(2, '0');
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${j}/${m}/${d.getFullYear()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers JSON
// ─────────────────────────────────────────────────────────────────────────────
function createJsonLigne(facture: Facture): LignePdf[] {
    // Lecture par nom de champ (LigneCell) : plus de dépendance à la position des cellules
    const cells = parseLigne(facture.ligne) ?? [];
    return cells.map(c => {
        const pourRemise = String(c.pourRemise0 ?? '0');
        const avecRemise = parseFloat(pourRemise.replace(',', '.')) > 0;
        let libRemise = '', puUnitNet = c.prixUnitaire0 ?? '0,00', montRemise = '0.00', pourcent = '';
        if (avecRemise) {
            const r = calPrixUnitNet(pourRemise, c.prixUnitaire0 ?? '0');
            libRemise = r.libRemise; puUnitNet = r.puUnitNet; montRemise = r.montantRemise; pourcent = pourRemise;
        }
        return {
            libel   : c.textHtml0     ?? '',
            unite   : c.unite0        ?? '',
            pu      : c.prixUnitaire0 ?? '',
            qte     : c.quantite0     ?? '',
            base    : avecRemise ? (c.baseHt0 ?? '') : '—',
            remise  : avecRemise ? `${pourRemise} %<br>${c.remise0 ?? ''}` : '—',
            montant : c.montantHt0    ?? '',
            tva     : c.tauxTva0      ?? '',
            libRemise, puUnitNet, montRemise, pourcent,
        };
    });
}
function createJsonFacTotal(facture: Facture, regimeTva: string): TotalPdf[] {
    const raw = String(facture.total ?? '');
    if (!raw) return [];
    const imputCreCli = parseFloat(String(facture.imputCreCli ?? '0').replace(',', '.')) || 0;
    const lignes = raw.split('|').filter(Boolean).map(row => {
        const arr   = row.split('¤');
        const tauxTva = regimeTva === 'B' ? extrairePourcentage(arr[1] ?? '') : '0.00';
        return {
            libel      : arr[1] ?? '', 
            brut       : arr[2] ?? '',
            acompImput : arr[3] ?? '', 
            montHt     : arr[4] ?? '',
            tauxTva,
            montTva    : arr[5] ?? '',
            montTtc    : arr[6] ?? '',
        };
    });
    // ── Pas d'imputation : forcer acompImput vide ─────────────────
    if (imputCreCli === 0) {
        for (const l of lignes) { l.acompImput = ''; }
        return lignes;
    }
    // ── Recalcul si imputCreCli > 0 mais acompImput vide ─────────
    if (regimeTva === 'B') {
        const montantTotalHT = lignes.reduce((sum, l) => sum + (parseFloat(l.brut.replace(',', '.')) || 0), 0);
        if (montantTotalHT > 0) {
            for (const l of lignes) {
                if (!l.acompImput) {
                    const montBrut = parseFloat(l.brut.replace(',', '.')) || 0;
                    const tauxTva  = parseFloat(l.tauxTva.replace(',', '.')) || 0;
                    const acompte  = (imputCreCli * (montBrut / montantTotalHT)) / (1 + tauxTva / 100);
                    const montHt   = montBrut - acompte;
                    const montTva  = (montHt * tauxTva) / 100;
                    l.acompImput   = fmt2fr(acompte);
                    l.montHt       = fmt2fr(montHt);
                    l.montTva      = fmt2fr(montTva);
                    l.montTtc      = fmt2fr(montHt + montTva);
                }
            }
        }
    }
    return lignes;
}

function fmt2fr(v: number): string { return v.toFixed(2).replace('.', ','); }

function createJsonLigTot(totState: FactureTotauxState): LigTotPdf[] {
    const arrs = [totState.arrTot10, totState.arrTot20, totState.arrTot30, totState.arrTot40, totState.arrTot50];
    return arrs.filter(a => a?.length > 0).map(a => ({
        libel : a[0] ?? '',
        mont  : formatMontant(a[1] ?? 0)
    }));
}
// ─────────────────────────────────────────────────────────────────────────────
// Bloc pénalités
// ─────────────────────────────────────────────────────────────────────────────
function buildPenaliteBlock(facture: Facture): unknown | null {
    const codeType = String(facture.codeType);
    const cli    = parseClientArray(String(facture.client ?? ''));
    if (codeType !== '30' || Number(cli[10]) !== 0) return null;
    const t = Number((facture as Record<string, unknown>).typePenalite ?? -1);
    const i = String((facture as Record<string, unknown>).indemForfait ?? '0').replace('.', ',');
    const textes: Record<number, unknown[]> = {
        0: [{text:[{text:"Tout retard de paiement est passible de pénalités de retard (article L441-10 du Code de Commerce) calculées sur la base de trois fois le taux d'intérêt légal en vigueur en France et d'une indemnité forfaitaire de "},{text:i},{text:"€ due pour frais de recouvrement (article D.441-5 du Code du Commerce)."}]}],
        1: [{text:[{text:"Tout retard de paiement est passible de pénalités de retard (article L441-10 du Code de Commerce) calculées sur la base de trois fois le taux d'intérêt légal en vigueur en France."}]}],
        2: [{text:[{text:"Tout retard de paiement est passible de pénalités de retard (article L441-10 du Code de Commerce) calculées sur la base du taux de la BCE à son opération de refinancement la plus récente majoré de 10 points et d'une indemnité forfaitaire de "},{text:i},{text:"€ due pour frais de recouvrement (article D.441-5 du Code du Commerce)."}]}],
        3: [{text:[{text:"Tout retard de paiement est passible de pénalités de retard (article L441-10 du Code de Commerce) calculées sur la base du taux de la BCE à son opération de refinancement la plus récente majoré de 10 points."}]}],
        4: [{text:[{text:"Tout retard de paiement est passible de pénalités de retard et d'une indemnité forfaitaire de "},{text:i},{text:"€ due pour frais de recouvrement selon les dispositions de nos Conditions Générales de Vente."}]}],
        5: [{text:[{text:"Tout retard de paiement est passible de pénalités de retard selon les dispositions de nos Conditions Générales de Vente."}]}],
        6: [{text:[{text:"Tout retard de paiement est passible de pénalités de retard calculées sur la base du taux de la BCE et d'une indemnité forfaitaire de "},{text:i},{text:"€ due pour frais de recouvrement selon les dispositions de nos Conditions Générales de Vente."}]}],
        7: [{text:[{text:"Tout retard de paiement est passible de pénalités de retard calculées sur la base du taux de la BCE selon les dispositions de nos Conditions Générales de Vente."}]}],
        8: [{text:[{text:"Tout retard de paiement est passible de pénalités de retard calculées selon les dispositions de nos Conditions Générales de Vente."}]}],
    };
    return { stack: textes[t] ?? [], fontSize: 8, alignment: 'left', margin: [0, 20, 0, 0] };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildDocDefinition — construction du document pdfmake
// ─────────────────────────────────────────────────────────────────────────────
export function buildDocDefinition(ctx: PdfContext): unknown {
    const { facture, abonne, totState } = ctx;
    if (!facture) return {};
    // ── Variables de base ─────────────────────────────────────────
    const codeType  = String(facture.codeType);
    const regimeTva = facture.regimeTva ?? '';
    const refFac    = facture.refFac   ?? '';
    const refDevis  = facture.refDevis  ?? '';
    // ── Entête — détermine présence d'un Devis lié ────────────────
    let factAvecDevis = 0;
    let col2      = refFac;
    if (['20', '30', '40'].includes(codeType)) {
        factAvecDevis = 1;
        if (refDevis && refDevis !== 'sans') {
            factAvecDevis = 2;
            col2          = refDevis;
        }
    }
    // ── Données client et abonné ──────────────────────────────────
    const clientArr   = parseClientArray(String(facture.client ?? ''));
    const acompTaux   = String(facture.acompTaux ?? '');
    const nbreLigRem  = totState.nbreLigRem0 ?? 0;
    const imputAcomp  = String(totState.imputAcomp0 ?? '0');
    const imputCreCli = parseFloat(String(facture.imputCreCli ?? '0').replace(',', '.')) || 0;
    const abo         = abonne as Record<string, unknown>;
    const temoinLogo  = Number(abo.temoinLogo ?? 0);
    const logoArr     = parseLogoText(String(abo.logoText ?? ''));
    // ── Configuration colonnes totalisation ───────────────────────
    let confColTot = 0;
    if (regimeTva === 'B') confColTot += 1;
    if ((codeType === '10' && Number(acompTaux) > 0 && regimeTva === 'B') || imputAcomp === '3' || (regimeTva === 'B' && imputCreCli > 0)) confColTot += 10;
    // ── Données JSON ──────────────────────────────────────────────
    const jsonLignes = (codeType === '10' || codeType === '30') ? createJsonLigne(facture) : [];
    const jsonTotaux = createJsonFacTotal(facture, regimeTva);
    const jsonLigTot = createJsonLigTot(totState);
    // ── Dates et montants ─────────────────────────────────────────
    const dateEch    = String(facture.dateEcheance ?? '').split('|')[0] ?? '';
    const dateEmis   = formatDateFr(facture.dateEmis);
    const dateRegl   = formatDateFr(facture.dateRegl);
    const totRegl    = formatMontant(facture.totRegl ?? 0);
    const montCli    = formatMontant(facture.montCli ?? 0);
    const refPre     = String(facture.refPre  ?? '');
    const bdp1       = totState.bdp1Label0 ?? '';
    // ── Bloc pénalités ────────────────────────────────────────────
    const penBlock = buildPenaliteBlock(facture);
    // ── Layout tableau ────────────────────────────────────────────
    const tableLayout = {
        hLineWidth:   (i: number, n: Record<string, unknown>) => i === 0 || i === (n.table as Record<string, unknown[]>).body.length ? 1 : 0.5,
        vLineWidth:   () => 0.5,
        hLineColor:   () => '#D3D3D3',
        vLineColor:   () => '#D3D3D3',
        paddingLeft:  () => 0,
        paddingRight: () => 0,
    };
    // ── generateLigne — lignes facturation ou totalisation ────────
    const generateLigne = (lines: (LignePdf | TotalPdf)[], origine: 'fac' | 'tot') => {
        let header: unknown[];
        if (origine === 'fac') {
            header = [
                {text:'Libellé', style:'tableHeader2'},
                {text:'Unité',   style:'tableHeader2'},
                {text:'P.U.',    style:'tableHeader2'},
                {text:'Qté',     style:'tableHeader2'},
                ...(nbreLigRem > 0 ? [
                {text:'Base',    style:'tableHeader2'},
                {text:'Remise',  style:'tableHeader2'},
                ] : []),
                {text:'Montant', style:'tableHeader2'},
                ...(regimeTva === 'B' ? [{text:'% Tva', style:'tableHeader2'}] : []),
            ];
        } else {
            header = [
                {text:'Totalisation', style:'tableHeader2'},
                ...(regimeTva === 'B' ? [{text:'Brut HT', style:'tableHeader2'}] : []),
                ...((codeType === '10' && Number(acompTaux) > 0 && regimeTva === 'B') || imputAcomp === '3' || (regimeTva === 'B' && imputCreCli > 0) ? [
                    {text: imputCreCli > 0 ? 'Imputation HT' : 'Acompte HT', style:'tableHeader2'},
                    {text:'Net HT', style:'tableHeader2'},
                ] : []),
                ...(regimeTva === 'B' ? [{text:'% Tva', style:'tableHeader2'}] : []),
                {text:'Total Ttc', style:'tableHeader2'},
            ];
        }
        const totalColumns = header.length;
        let widths: (string | number)[];
        if (origine === 'fac') {
            const libelWidth = [300, 280, 220, 200][totalColumns - 5] ?? 200;
            widths = [libelWidth, ...Array(totalColumns - 1).fill('*')];
        } else {
            widths = ({
                2: ['*', 60],
                4: [350, '*', '*', 60],
                6: [230, '*', '*', '*', '*', 60],
            } as Record<number, (string | number)[]>)[totalColumns] ?? Array(totalColumns).fill('*');
        }
        const rows = lines.map(line => {
            if (origine === 'fac') {
                const l = line as LignePdf;
                return [
                    {text: htmlToPdfMake(l.libel), style:'tableBody3'},
                    {text: l.unite,                style:'tableBody2'},
                    {text: l.pu,                   style:'tableBody2'},
                    {text: l.qte,                  style:'tableBody2'},
                    ...(nbreLigRem > 0 ? [
                        {text: l.base,                     style:'tableBody2'},
                        {text: htmlToPdfMake(l.remise),    style:'tableBody2'},
                    ] : []),
                    {text: l.montant,        style:'tableBody2'},
                    ...(regimeTva === 'B' ? [{text: l.tva,  style:'tableBody2'}] : []),
                ];
            } else {
                const t = line as TotalPdf;
                return [
                    {text: t.libel,    style:'tableBody3'},
                    ...(confColTot === 1 || confColTot === 11 ? [{text: t.brut,    style:'tableBody2'}] : []),
                    ...(confColTot === 10 || confColTot === 11 ? [
                        {text: t.acompImput, style:'tableBody2'},
                        {text: t.montHt,   style:'tableBody2'},
                    ] : []),
                    ...(confColTot === 1 || confColTot === 11 ? [{
                        stack: [
                            {text: t.montTva, style:'tableBody2'},
                            ...(imputCreCli > 0 && t.acompImput && parseFloat(t.acompImput.replace(',', '.')) > 0 ? [{
                                text:    `Tva/Imput: ${(parseFloat(t.acompImput.replace(',', '.')) * parseFloat(t.tauxTva.replace(',', '.')) / 100).toFixed(2).replace('.', ',')}`,
                                fontSize:  6,
                                italics:  true,
                                color:   '#666666',
                                alignment: 'center' as const,
                            }] : []),
                        ],
                        style: 'tableBody2',
                    }] : []),
                    {text: t.montTtc,   style:'tableBody2'},
                ];
            }
        });
        return { headerRows: 1, widths, body: [header, ...rows] };
    };
    // ── generateTotalMontant — tableau des totaux ─────────────────
    const generateTotalMontant = () => jsonLigTot.map((line, i) => {
        const gras = i === (totState.numLigneGras0 ?? 0);
        return [
            {text: line.libel, ...(gras ? {bold:true, fontSize:11, alignment:'left'}  : {fontSize:9, alignment:'left'})},
            {text: line.mont,  ...(gras ? {bold:true, fontSize:11, alignment:'center'} : {fontSize:9, alignment:'center'})},
        ];
    });
    // ── Table entête droite ───────────────────────────────────────
    const buildHeaderTable = () => {
        const headerRow: unknown[] = [];
        const dataRow:  unknown[] = [];
        if (factAvecDevis === 2) {
            headerRow.push({text:'N° Facture', style:'tableHeader'});
            dataRow.push({text:refFac,     style:'tableBody'});
        }
        headerRow.push(factAvecDevis === 0 || factAvecDevis === 2 ? {text:'N° Devis',  style:'tableHeader'} : {text:'N° Facture', style:'tableHeader'});
        dataRow.push({text:col2, style:'tableBody'});
        headerRow.push({text:'Date', style:'tableHeader'});
        headerRow.push({text:'Page', style:'tableHeader'});
        dataRow.push({text:dateEmis, style:'tableBody'});
        dataRow.push({text:'1/1',   style:'tableBody'});
        return {
            headerRows: 1,
            widths:   Array(headerRow.length).fill('auto'),
            body:    [headerRow, dataRow],
        };
    };

    // ──────────────────────────────────────────────────────────────
    // Construction du document
    // ──────────────────────────────────────────────────────────────
    return {
        pageMargins: [35, 30, 35, 20],
        content: [
            // ══ EN-TÊTE ═══════════════════════════════════════════
            { columns: [
                // ── Colonne gauche : Logo & données Abonné ───────────────────────
                { width: 'auto', stack: [
                    ...(temoinLogo === 0 ? [
                        {text:[{text:logoArr.ligne10},{text:'\n'}], fontSize:14, bold:true, alignment:'left'},
                        {text:[{text:logoArr.ligne20}],       fontSize:14, bold:true, alignment:'left'},
                    ] : []),
                    ...(temoinLogo === 1 && ctx.logoBase64 ? [{image:ctx.logoBase64, width:150}] : []),
                    {text:[
                        {text:[{text: abonne.adresse0 ?? ''},{text:'\n'}]},
                        {text:[{text: abonne.cp0 ?? ''},{text:' '},{text: abonne.ville0 ?? ''},{text:'\n'}]},
                        {text:'Courriel : ' + (abonne.email  ?? '') + '\n'},
                        {text:'Siren : '   + (abonne.siren0 ?? '') + '\n'},
                    ], style:'enteteStyle', margin:[0, 10, 0, 0]},
                ]},
                // ── Colonne centrale : espace ─────────────────────
                {width:'*', text:''},
                // ── Colonne droite : Réf + Client ─────────────────
                { width:'auto', stack: [
                    { alignment:'right',
                        table:  buildHeaderTable(),
                        layout: {
                            hLineWidth: (i: number, n: Record<string,unknown>) =>i === 0 || i === (n.table as Record<string,unknown[]>).body.length ? 1 : 0.5,
                            vLineWidth:   () => 0.5,
                            hLineColor:   () => '#D3D3D3',
                            vLineColor:   () => '#D3D3D3',
                            paddingLeft:  () => 8,
                            paddingRight: () => 8,
                        },
                    },
                    ...((codeType==='20'||codeType==='30') && facture.statutCode===1
                        ? [{text:'Facture Annulée', fontSize:12, bold:true, alignment:'center', color:'red',  margin:[0,10,0,0]}]
                        : []),
                    ...(codeType==='40'
                        ? [{text:"Facture d'Avoir",  fontSize:12, bold:true, alignment:'center', color:'black', margin:[0,10,0,0]}]
                        : []),
                    { stack:[
                        {text:[{text:'\n'},{text:'Destinataire ', bold:true},{text:'\n'}], style:'enteteStyle'},
                        {canvas:[{type:'line', x1:10, y1:0, x2:180, y2:0, lineWidth:1, lineColor:'black'}], margin:[0,0,0,5]},
                        {text:[
                            {text:[{text:clientArr[0]},{text:'\n'}]},
                            {text:[{text:clientArr[1]},{text:'\n'}]},
                            {text:[{text:clientArr[2]},{text:'\n'}]},
                            {text:[{text:clientArr[3]},{text:' '},
                            {text:clientArr[4]},{text:' '},{text:clientArr[5]}]},
                            ...(clientArr[6]||clientArr[7] ? [{text:[
                                {text:'Contact: '},{text:clientArr[6]},
                                {text:' N° tel. '},{text:clientArr[7]},
                            ]}] : []),
                        ], style:'enteteStyle'},
                    ], margin:[0,0,0,0]},
                ]},
            ]},
            // ══ LIBELLÉ AFFAIRE ═══════════════════════════════════
            {text: ctx.libAffaire, fontSize:14, bold:true, alignment:'center', margin:[0,30,0,0]},
            // ══ TEXTE INTRODUCTIF ══════════════════════════════════
            ...(codeType==='10' ? [
                {text:[{text:'Ci-joint la proposition relative à votre commande. Celle-ci est valable jusqu\'au '},{text:dateEch},{text:'.'}], fontSize:10, alignment:'left', margin:[0,30,0,0]},
                ...(acompTaux.length===0
                ? [{text:"En cas d'acceptation merci de nous renvoyer un exemplaire daté et signé avec la mention 'bon pour accord'.", fontSize:10, alignment:'left', margin:[0,30,0,0]}]
                : [{text:"En cas d'acceptation merci de nous renvoyer un exemplaire daté et signé avec la mention 'bon pour accord' accompagné du règlement de l'Acompte.", fontSize:10, alignment:'left', margin:[0,0,0,0]}]),
            ] : []),
            ...(codeType==='20' ? [{text:[
                {text:"Veuillez trouver ci-joint la Facture d'Acompte conformément aux détails portés sur le Devis cité en référence en date du "},
                {text:dateRegl},{text:' et suivant votre règlement de '},{text:totRegl},{text:'€ .'},
            ], fontSize:10, alignment:'left', margin:[0,30,0,0]}] : []),
            ...(codeType==='30' ? [
                {text:"Veuillez trouver ci-joint la Facture relative à votre commande.", fontSize:10, alignment:'left', margin:[0,30,0,0]},
                {text:[{text:'Valeur en votre aimable règlement à réception de cette facture avant le '},{text:dateEch},{text:'.'}], fontSize:10, alignment:'left', margin:[0,0,0,0]},
            ] : []),
            ...(codeType==='40' ? [{text:[
                {text:"Veuillez trouver ci-joint la Facture d'Avoir en annulation de la facture N° "},
                {text:refPre},{text:'.'},
            ], fontSize:10, alignment:'left', margin:[0,30,0,0]}] : []),
            // ══ TABLE LIGNES DE FACTURATION ════════════════════════
            ...((codeType==='10'||codeType==='30') ? [{
                alignment: 'left',
                margin:   [0, 10, 0, 0],
                table:   generateLigne(jsonLignes, 'fac'),
                layout:   tableLayout,
            }] : []),
            // ══ TABLE TOTALISATION ═════════════════════════════════
            {
                alignment: 'left',
                margin:   [0, 50, 0, 0],
                table:   generateLigne(jsonTotaux, 'tot'),
                layout:   tableLayout,
            },
            // ══ MONTANTS TOTAUX ════════════════════════════════════
            {
                alignment: 'right',
                margin:   [0, 10, 0, 0],
                columns: [
                    {width: '*', text: ''},
                    {
                        width:  'auto',
                        table:  {widths: ['auto', 60], body: generateTotalMontant()},
                        layout: {
                            hLineWidth:  () => 0,
                            vLineWidth:  () => 0,
                            paddingLeft:  () => 0,
                            paddingRight: () => 0,
                            paddingBottom:() => 0,
                            paddingTop:  () => 1,
                        },
                    },
                ],
            },
            // ══ MENTION AVOIR CRÉDITEUR ════════════════════════════
            ...(codeType==='40' && montCli !== '0,00' ? [{text:[
                {text:'Vous êtes Créditeur de la somme de '},
                {text:montCli.replace(/[-]/, '')},
                {text:'€ au titre du montant réglé sur la Facture annulée.'},
            ], fontSize:10, alignment:'left', margin:[0,20,0,0]}] : []),
            // ══ MENTION PÉNALITÉS ══════════════════════════════════
            ...(penBlock ? [penBlock] : []),
        ],
        // ══ PIED DE PAGE ═══════════════════════════════════════════
        footer: () => ({
            stack: [
                {canvas:[{type:'line', x1:30, y1:0, x2:565, y2:0, lineWidth:1, lineColor:'lightgray'}], margin:[0,-15,0,5]},
                {text:[{text:bdp1}], alignment:'center', margin:[0,0,0,0], fontSize:9, color:'lightgray'},
            ],
        }),
        // ══ STYLES ═════════════════════════════════════════════════
        styles: {
            tableHeader:  {bold:true, fontSize:8, color:'white', fillColor:[127,179,213], lineWidth:0.3, lineColor:[211,211,211], alignment:'center'},
            tableBody:    {fontSize:9, color:'black', lineColor:[215,219,221], alignment:'center'},
            enteteStyle:  {fontSize:10, margin:[10,0,0,0], alignment:'left'},
            tableHeader2: {bold:true, fontSize:9, color:'white', fillColor:[127,179,213], lineWidth:0.3, lineColor:[211,211,211], alignment:'center'},
            tableBody2:   {fontSize:9, color:'black', lineColor:[215,219,221], alignment:'center'},
            tableBody3:   {fontSize:9, color:'black', lineColor:[215,219,221], alignment:'left'},
        },
        // ══ FILIGRANE BROUILLON ════════════════════════════════════
        //...(refFac.startsWith('FB') ? {watermark:{text:'FACTURE BROUILLON', color:'lightgray', fontSize:60, bold:true, italics:false, angle:-40}} : {}),
        ...(refFac.startsWith('FB') ? {watermark:{text:'FACTURE BROUILLON', color:'lightgray', fontSize:70, bold:true, italics:false, angle:-40}} : {}),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// generateDocumentPdf — point d'entrée principal
// ─────────────────────────────────────────────────────────────────────────────
export async function generateDocumentPdf(action: string, ctx: PdfContext): Promise<void> {
    // ── Chargement dynamique de vfs_fonts ────────────────────────
    const vfsModule = await import('pdfmake/build/vfs_fonts');
    (pdfMake as unknown as Record<string, unknown>).vfs = vfsModule.default ?? vfsModule;
    // ── Construction du document ──────────────────────────────────
    const docDefinition = buildDocDefinition(ctx) as TDocumentDefinitions;
    const libFichier   = ctx.nomPdfGauche + ctx.nomPdfDroite;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdf = pdfMake.createPdf(docDefinition) as unknown as any;
    // ── Télécharger ───────────────────────────────────────────────
    if (action === 'download') {
        pdf.download(`${libFichier}.pdf`);
    // ── Ouvrir dans une nouvelle fenêtre ──────────────────────────
    } else if (action === 'open') {
        pdf.open();
    // ── Imprimer ──────────────────────────────────────────────────
    } else if (action === 'print') {
        pdf.print();
    // ── Générer Factur-X ──────────────────────────────────────────
    } else if (action === 'facturX') {
        const pdfBlob: Blob = await pdf.getBlob();
        const pdfBuffer = await pdfBlob.arrayBuffer();
        const xml = generateXmlFacturX(ctx);
        const xmlBytes = new TextEncoder().encode(xml);
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        await pdfDoc.attach(xmlBytes, 'factur-x.xml', {
            mimeType:     'text/xml',
            description:    'Factur-X XML invoice',
            creationDate:   new Date(),
            modificationDate: new Date(),
            afRelationship:  AFRelationship.Alternative,
        });
        const finalPdf = await pdfDoc.save();
        const blob = new Blob([new Uint8Array(finalPdf)], {type: 'application/pdf'});
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${libFichier}_facturx.pdf`;
        link.click();
    }
}
