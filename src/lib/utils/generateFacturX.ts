import type { PdfContext } from './generateDocumentPdf';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function toXmontant(value: string | number | null | undefined): string {
    if (typeof value === 'string') value = value.replace(',', '.');
    const n = parseFloat(String(value ?? '0'));
    return isNaN(n) ? '0.00' : n.toFixed(2);
}
function toXDate(frenchDate:string): string {
    return frenchDate.slice(6, 10) + frenchDate.slice(3, 5) + frenchDate.slice(0, 2);
}
function suprBr(str:string): string {
    return str.replace('<br>', ' ');
}
function toXTypeCode(codeType:string): string {
    return ({ 20:'386', 30:'380', 40:'381' } as Record<string, string>)[codeType] ?? '';
}
function toXUnite(unite:string): string {
    return ({
        heure:'HUR', jour:'DAY', semaine:'WEE', mois:'MON', m:'MRT', m2:'MTK', m3:'MTQ', gramme:'GRM', kg:'KGM', tonne:'TNE', litre:'LTR',
    } as Record<string, string>)[unite] ?? 'C62';
}
function toXTypeDelai(facture:Record<string, unknown>): string {
    const delai = String(facture.typeDelai ?? '1');
    return ({
        1: `Délai légal ${facture.delai} jours`,
        2: '45 jours fin de mois',
        3: '45 jours date émission',
        4: '60 jours date émission',
    } as Record<string, string>)[delai] ?? '';
}
function toXPenalite(typePenalite: string, indemForfait: string): { penalite: string; indemForfait: string } {
    const i = indemForfait.replace('.', ',');
    const MAP: Record<string, [string, string]> = {
        '0': ["Tout retard de paiement est passible de pénalités de retard (article L441-10 du Code de Commerce) calculées sur la base de trois fois le taux d'intérêt légal en vigueur en France", `Indemnité forfaitaire de ${i}€ due pour frais de recouvrement (article D.441-5 du Code du Commerce)`],
        '1': ["Tout retard de paiement est passible de pénalités de retard (article L441-10 du Code de Commerce) calculées sur la base de trois fois le taux d'intérêt légal en vigueur en France", ''],
        '2': ["Tout retard de paiement est passible de pénalités de retard (article L441-10 du Code de Commerce) calculées sur la base du taux de la BCE à son opération de refinancement la plus récente majoré de 10 points", `Indemnité forfaitaire de ${i}€ due pour frais de recouvrement (article D.441-5 du Code du Commerce)`],
        '3': ["Tout retard de paiement est passible de pénalités de retard (article L441-10 du Code de Commerce) calculées sur la base du taux de la BCE à son opération de refinancement la plus récente majoré de 10 points", ''],
        '4': ["Tout retard de paiement est passible de pénalités de retard selon les dispositions de nos Conditions Générales de Vente", `Indemnité forfaitaire de ${i}€ due pour frais de recouvrement selon les dispositions de nos Conditions Générales de Vente`],
        '5': ["Tout retard de paiement est passible de pénalités de retard selon les dispositions de nos Conditions Générales de Vente", ''],
        '6': ["Tout retard de paiement est passible de pénalités de retard calculées sur la base du taux de la BCE selon les dispositions de nos Conditions Générales de Vente", `Indemnité forfaitaire de ${i}€ due pour frais de recouvrement selon les dispositions de nos Conditions Générales de Vente`],
        '7': ["Tout retard de paiement est passible de pénalités de retard calculées sur la base du taux de la BCE selon les dispositions de nos Conditions Générales de Vente", ''],
        '8': ["Tout retard de paiement est passible de pénalités de retard calculées selon les dispositions de nos Conditions Générales de Vente", ''],
    };
    const [p, ind] = MAP[typePenalite] ?? ['', ''];
    return { penalite:p, indemForfait:ind };
}

// ─────────────────────────────────────────────────────────────────────────────
// generateXmlFacturX
// ─────────────────────────────────────────────────────────────────────────────
export function generateXmlFacturX(ctx:PdfContext): string {
    const { facture, abonne } = ctx;
    const fac          = facture as Record<string, unknown>;
    const abo          = abonne  as Record<string, unknown>;
    const codeType     = String(facture.codeType);
    const regimeTva    = facture.regimeTva ?? '';
    const refFac       = facture.refFac    ?? '';
    const dateEmis     = String(fac.dateEmisStr ?? fac.dateEmis ?? '');
    const dateEch      = String(facture.dateEcheance ?? '').split('|')[0];
    const clientArr    = String(facture.client ?? '').split('¤');
    const typePenalite = String(fac.typePenalite ?? '0');
    const indemForfait = String(fac.indemForfait ?? '0');
    const { penalite, indemForfait: indemLib } = toXPenalite(typePenalite, indemForfait);

    // Lignes facturation
    const lignes = String(facture.ligne  ?? '').split('|').filter(Boolean).map(row => row.split('¤'));
    // Lignes totalisation
    const totaux = String(facture.total  ?? '').split('|').filter(Boolean).map(row => row.split('¤'));
    // Lignes total final
    const { arrTot10, arrTot20, arrTot30, arrTot40, arrTot50 } = ctx.totState;
    const ligTot = [arrTot10, arrTot20, arrTot30, arrTot40, arrTot50].filter(a => a?.length > 0);
    // ── Helpers internes ──────────────────────────────────────────────────────
    const buildLigneFacturation = (arr:string[], idx:number): string => {
        const billedQty = arr[1] === 'Débours'
            ? '<ram:BilledQuantity unitCode="0.00">0.00</ram:BilledQuantity>'
            : `<ram:BilledQuantity unitCode="${toXUnite(arr[2] ?? '')}">${toXmontant(arr[4])}</ram:BilledQuantity>`;
        const remise = arr[6]
            ?   ['<ram:AppliedTradeAllowanceCharge>',
                    '<ram:ChargeIndicator>false</ram:ChargeIndicator>',
                    `<ram:ActualAmount>${toXmontant(arr[8])}</ram:ActualAmount>`,
                    '<ram:Reason>Remise</ram:Reason>',
                '</ram:AppliedTradeAllowanceCharge>',
                ].join('')
            : '';
         const taxLine = arr[1] === 'Débours'
            ?   [ '<ram:CategoryCode>E</ram:CategoryCode>',
                    '<ram:ExemptionReason>Débours</ram:ExemptionReason>',
                    '<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>',
                ].join('')
            : regimeTva !== 'B'
                ? ['<ram:CategoryCode>E</ram:CategoryCode>',
                    '<ram:ExemptionReason>Franchise de TVA, art. 293B du Code Général des Impôts</ram:ExemptionReason>',
                    '<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>',
                  ].join('')
                :   ['<ram:TypeCode>VAT</ram:TypeCode>',
                        '<ram:CategoryCode>S</ram:CategoryCode>',
                        `<ram:RateApplicablePercent>${toXmontant(arr[8])}</ram:RateApplicablePercent>`,
                    ].join('');
        return [
            '<ram:IncludedSupplyChainTradeLineItem>',
                `<ram:AssociatedDocumentLineDocument>
                    <ram:LineID>${idx + 1}</ram:LineID>
                </ram:AssociatedDocumentLineDocument>`,
                `<ram:SpecifiedTradeProduct>
                    <ram:Name>${suprBr(arr[1] ?? '')}</ram:Name>
                </ram:SpecifiedTradeProduct>`,
                '<ram:SpecifiedLineTradeAgreement>',
                    `<ram:SpecifiedLineTradeDelivery>${billedQty}</ram:SpecifiedLineTradeDelivery>`,
                    `<ram:GrossPriceProductTradePrice>
                        <ram:ChargeAmount>${toXmontant(arr[3])}</ram:ChargeAmount>
                    </ram:GrossPriceProductTradePrice>`,
                    `<ram:NetPriceProductTradePrice>
                        <ram:ChargeAmount>${toXmontant(arr[3])}</ram:ChargeAmount>
                        ${remise}
                    </ram:NetPriceProductTradePrice>`,
                '</ram:SpecifiedLineTradeAgreement>',
                '<ram:SpecifiedLineTradeSettlement>',
                    `<ram:ApplicableTradeTax>
                        <ram:TypeCode>VAT</ram:TypeCode>
                        ${taxLine}
                    </ram:ApplicableTradeTax>`,
                    `<ram:SpecifiedTradeSettlementLineMonetarySummation>
                        <ram:LineTotalAmount>${toXmontant(arr[7])}</ram:LineTotalAmount>
                    </ram:SpecifiedTradeSettlementLineMonetarySummation>`,
                '</ram:SpecifiedLineTradeSettlement>',
            '</ram:IncludedSupplyChainTradeLineItem>',
        ].join('');
    };
    const buildLigneTotalisation = (arr: string[], idx: number): string => {
        const prepaid = regimeTva === 'B' && arr[3]
            ? `<ram:PrepaidAmount currencyID="EUR">${toXmontant(arr[3])}</ram:PrepaidAmount>`
            : '';
        const taxBlock = arr[1] === 'Débours'
            ? [ '<ram:CategoryCode>E</ram:CategoryCode>',
                '<ram:ExemptionReason>Débours</ram:ExemptionReason>',
                '<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>',
                '<ram:CalculatedAmount>0.00</ram:CalculatedAmount>',
            ].join('')
            : regimeTva !== 'B'
                ? [ '<ram:CategoryCode>E</ram:CategoryCode>',
                    '<ram:ExemptionReason>Franchise de TVA, art. 293B du Code Général des Impôts</ram:ExemptionReason>',
                    '<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>',
                    '<ram:CalculatedAmount>0.00</ram:CalculatedAmount>',
                  ].join('')
                : [ '<ram:CategoryCode>S</ram:CategoryCode>',
                    `<ram:RateApplicablePercent>${arr[0]?.slice(0, 4) ?? '0.00'}</ram:RateApplicablePercent>`,
                    `<ram:CalculatedAmount>${toXmontant(arr[5])}</ram:CalculatedAmount>`,
                  ].join('');
        const ligTotXml = ligTot.map(lt => [
            lt[0] === 'Total TTC'           ? `<ram:GrandTotalAmount>${toXmontant(lt[1])}</ram:GrandTotalAmount>`     : '',
            lt[0] === 'Acompte réglé'       ? `<ram:TotalPrepaidAmount>${toXmontant(lt[1])}</ram:TotalPrepaidAmount>` : '',
            lt[0] === 'Imputation Excédent' ? `<ram:TotalPrepaidAmount>${toXmontant(lt[1])}</ram:TotalPrepaidAmount>` : '',
            lt[0] === 'Total TTC Dû'        ? `<ram:DuePayableAmount>${toXmontant(lt[1])}</ram:DuePayableAmount>`     : '',
        ].join('')).join('');
        return [
            `<ram:AssociatedDocumentLineDocument><ram:LineID>${idx + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>`,
            '<ram:ApplicableTradeTax>',
                '<ram:TypeCode>VAT</ram:TypeCode>',
                    prepaid,
                    `<ram:TaxableAmount>${toXmontant(arr[4])}</ram:TaxableAmount>`,
                '<ram:TypeCode>VAT</ram:TypeCode>',
                taxBlock,
            '</ram:ApplicableTradeTax>',
            '<ram:SpecifiedTradeSettlementHeaderMonetarySummation>',
                ligTotXml,
            '</ram:SpecifiedTradeSettlementHeaderMonetarySummation>',
        ].join('');
    };
    // ── Blocs conditionnels ───────────────────────────────────────────────────
    const noteRegimeTva = regimeTva !== 'B'
        ? '<ram:IncludedNote><ram:Content>TVA non applicable, art. 293 B du CGI.</ram:Content></ram:IncludedNote>'
        : '';
    const notePenalite = codeType === '30'
        ? [`<ram:IncludedNote><ram:Content>${penalite}</ram:Content><ram:SubjectCode>PMD</ram:SubjectCode></ram:IncludedNote>`,
            indemLib ? `<ram:IncludedNote><ram:Content>${indemLib}</ram:Content><ram:SubjectCode>PMT</ram:SubjectCode></ram:IncludedNote>` : '',
          ].join('')
        : '';
    const lignesXml = codeType === '30'
        ? lignes.map((arr, idx) => buildLigneFacturation(arr, idx)).join('')
        : '';
    const totauxXml = totaux.map((arr, idx) => buildLigneTotalisation(arr, idx)).join('');
    const paiementXml = codeType === '30'
        ? [ '<ram:SpecifiedTradePaymentTerms>',
            `<ram:Description>${toXTypeDelai(fac)}</ram:Description>`,
            '<ram:DueDateDateTime>',
                `<udt:DateTimeString format="102">${toXDate(dateEch)}</udt:DateTimeString>`,
            '</ram:DueDateDateTime>',
            '</ram:SpecifiedTradePaymentTerms>',
        ].join('')
        : '';
    // ── Assemblage XML ────────────────────────────────────────────────────────
    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rsm:CrossIndustryInvoice',
            '    xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"',
            '    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
            '    xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"',
            '    xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"',
            '    xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100">',
            // ── Contexte ──────────────────────────────────────────────────────────
            '<rsm:ExchangedDocumentContext>',
                '<ram:GuidelineSpecifiedDocumentContextParameter>',
                    '<ram:ID>urn:factur-x.eu:1p0:EN16931:extended</ram:ID>',
                '</ram:GuidelineSpecifiedDocumentContextParameter>',
            '</rsm:ExchangedDocumentContext>',
            // ── Document ──────────────────────────────────────────────────────────
            '<rsm:ExchangedDocument>',
                `<ram:ID>${refFac}</ram:ID>`,
                `<ram:TypeCode>${toXTypeCode(codeType)}</ram:TypeCode>`,
                '<ram:IssueDateDate>',
                    `<udt:DateString format="102">${toXDate(dateEmis)}</udt:DateString>`,
                '</ram:IssueDateDate>',
                noteRegimeTva,
                notePenalite,
            '</rsm:ExchangedDocument>',
            // ── Transaction ───────────────────────────────────────────────────────
            '<rsm:SupplyChainTradeTransaction>',
                // Accord commercial
                '<ram:ApplicableHeaderTradeAgreement>',
                    // Vendeur
                    '<ram:SellerTradeParty>',
                        `<ram:Name>${abo.raisonSociale as string ?? ''}</ram:Name>`,
                        '<ram:PostalTradeAddress>',
                            `<ram:LineOne>${abo.adres as string ?? ''}</ram:LineOne>`,
                            `<ram:PostcodeCode>${abo.cp as string ?? ''}</ram:PostcodeCode>`,
                            `<ram:CityName>${abo.ville as string ?? ''}</ram:CityName>`,
                            '<ram:CountryID>FR</ram:CountryID>',
                        '</ram:PostalTradeAddress>',
                        `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${abo.tvaIntra as string ?? ''}</ram:ID></ram:SpecifiedTaxRegistration>`,
                        `<ram:SpecifiedLegalOrganization>
                            <ram:ID>${abo.siren as string ?? ''}</ram:ID>
                        </ram:SpecifiedLegalOrganization>`,
                        '<ram:DefinedTradeContact>',
                            `<ram:PersonName>${abo.nomContact as string ?? ''}</ram:PersonName>`,
                            `<ram:TelephoneUniversalCommunication>
                                <ram:CompleteNumber>${abo.telPort as string ?? ''}</ram:CompleteNumber>
                            </ram:TelephoneUniversalCommunication>`,
                            `<ram:EmailURIUniversalCommunication>
                                <ram:URIID>${abo.mail as string ?? ''}</ram:URIID>
                            </ram:EmailURIUniversalCommunication>`,
                        '</ram:DefinedTradeContact>',
                    '</ram:SellerTradeParty>',
                    // Acheteur
                    '<ram:BuyerTradeParty>',
                        `<ram:Name>${clientArr[0] ?? ''}</ram:Name>`,
                        '<ram:PostalTradeAddress>',
                            `<ram:LineOne>${clientArr[1] ?? ''}</ram:LineOne>`,
                            `<ram:PostcodeCode>${clientArr[3] ?? ''}</ram:PostcodeCode>`,
                            `<ram:CityName>${clientArr[4] ?? ''}</ram:CityName>`,
                            '<ram:CountryID>FR</ram:CountryID>',
                        '</ram:PostalTradeAddress>',
                        `<ram:SpecifiedTaxRegistration>
                            <ram:ID schemeID="VA">${clientArr[11] ?? ''}</ram:ID>
                        </ram:SpecifiedTaxRegistration>`,
                        '<ram:DefinedTradeContact>',
                            `<ram:PersonName>${clientArr[6] ?? ''}</ram:PersonName>`,
                            `<ram:TelephoneUniversalCommunication>
                                <ram:CompleteNumber>${clientArr[7] ?? ''}</ram:CompleteNumber>
                            </ram:TelephoneUniversalCommunication>`,
                        '</ram:DefinedTradeContact>',
                    '</ram:BuyerTradeParty>',
                '</ram:ApplicableHeaderTradeAgreement>',
                // Lignes de facturation
                lignesXml,
                // Règlement
                '<ram:ApplicableHeaderTradeSettlement>',
                    totauxXml,
                    paiementXml,
                '</ram:ApplicableHeaderTradeSettlement>',
            '</rsm:SupplyChainTradeTransaction>',
        '</rsm:CrossIndustryInvoice>',
    ].join('');

    return xml.replace(/<!--[\s\S]*?-->/g, '');
}