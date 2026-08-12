// src/lib/server/affaireActions.ts
// ─────────────────────────────────────────────────────────────────────────────
// Logique métier centralisée pour la modification et la suppression d'une Affaire.
// Utilisée à la fois par 'affaire/+page.server.ts' et 'affaire/[id]/+page.server.ts' afin d'éviter toute divergence entre les deux points d'entrée.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from '$lib/server/prisma';
import type { Prisma } from '@prisma/client';
import { parseNbrMontAffaire, buildNbrMontAffaire } from '$lib/schemas/abonne';

const SITUATION_INDEX_MAP: Record<string, number> = { '00x':0, '10x':1, '20x':2, '30x':4, '11a':6, '11b':8, '31a':10, '31b':12 };

// ─── Mise à jour de abonne.nbrMontAffaire ────────────────────────────────────
export async function updateNbrMontAffaire(abonneId:number, delta:number, situationIndex:number, montant:number=0): Promise<void> {
    const abonne = await prisma.abonne.findUniqueOrThrow({
        where:  { id: abonneId },
        select: { nbrMontAffaire: true },
    });
    const arr = parseNbrMontAffaire(abonne.nbrMontAffaire);
    arr[situationIndex] = Math.max(0, arr[situationIndex] + delta);
    if (situationIndex !== 0) {
        const montIdx    = situationIndex + 1;
        const montActuel = arr[montIdx] ?? 0;
        arr[montIdx]     = Math.max(0, montActuel + (montant * delta));
    }
    await prisma.abonne.update({
        where: { id: abonneId },
        data:  { nbrMontAffaire: buildNbrMontAffaire(arr) },
    });
}

// ─── Mise à jour de abonne.suiviFac ──────────────────────────────────────────
export async function updateSuiviFacAbonne(abonneId:number, delta:number, suiviFacIndex:number, montant:number): Promise<void> {
    const abonne = await prisma.abonne.findUniqueOrThrow({
        where:  { id: abonneId },
        select: { suiviFac: true },
    });
    const parts     = abonne.suiviFac!.split('|');
    const countIdx  = suiviFacIndex;
    const count     = parseInt(parts[countIdx] ?? '0', 10) || 0;
    parts[countIdx] = String(Math.max(0, count + delta));
    if (suiviFacIndex !== 0) {
        const montIdx    = suiviFacIndex + 1;
        const montActuel = parseFloat((parts[montIdx] ?? '0').replace(',', '.')) || 0;
        const montResult = Math.max(0, montActuel + (montant * delta));
        parts[montIdx]   = montResult.toFixed(2).replace('.', ',');
    }
    await prisma.abonne.update({
        where: { id: abonneId },
        data:  { suiviFac: parts.join('|') },
    });
}
// ─── Résolution du libellé client ─────────────────────────────────────────────
export async function resolveLibClient(clientId:number, abonneId:number): Promise<string | null> {
    const client = await prisma.client.findFirst({
        where:  { id: clientId, abonneId },
        select: { libClient: true },
    });
    return client?.libClient ?? null;
}
// ─── Vérification de propriété d'une affaire ─────────────────────────────────
export async function getOwnedAffaire(affaireId:number, abonneId:number) {
    if (!affaireId || isNaN(affaireId)) {
        return { ok: false as const, error: 'Identifiant invalide.', status: 400 as const };
    }
    const existing = await prisma.affaire.findFirst({ where: { id:affaireId, abonneId } });
    if (!existing) {
        return { ok:false as const, error:'Affaire introuvable.', status:404 as const };
    }
    return { ok:true as const, id:affaireId, existing };
}
// ═════════════════════════════════════════════════════════════════════════════
// UPDATE — Logique métier partagée
// ═════════════════════════════════════════════════════════════════════════════
export type UpdateAffaireResult =
    | { ok:true }
    | { ok:false; error:string; status:400 | 404 | 500 };

export async function updateAffaireLogic(affaireId:number, abonneId:number, libAffaire:string, clientId:number):Promise<UpdateAffaireResult> {
    const owned = await getOwnedAffaire(affaireId, abonneId);
    if (!owned.ok) return { ok:false, error:owned.error, status:owned.status };
    const libClient = await resolveLibClient(clientId, abonneId);
    if (!libClient) return { ok:false, error:'Client introuvable ou non autorisé.', status:400 as const };
    try {
        await prisma.affaire.update({
            where: { id:affaireId },
            data: {libAffaire, clientId, libClient, updatedAt:new Date()} as Prisma.AffaireUpdateInput,
        });
        return { ok:true };
    } catch (err) {
        console.error('[affaireActions/update]', err);
        return { ok:false, error:'Erreur serveur lors de la mise à jour.', status:500 as const };
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// DELETE — Logique métier partagée : Suppression possible uniquement si l'affaire ne comporte que des Devis et/ou des Factures 'brouillon'
// le contrôle en amont est fait côté appelant via checkFacturesValidees, cette fonction exécute la suppression effective.
// ═════════════════════════════════════════════════════════════════════════════
export type DeleteAffaireResult =
    | { ok: true }
    | { ok: false; error: string; status: 400 | 404 | 500 };
export async function deleteAffaireLogic(
    affaireId: number,
    abonneId:  number,
): Promise<DeleteAffaireResult> {
    const owned = await getOwnedAffaire(affaireId, abonneId);
    if (!owned.ok) return { ok:false, error:owned.error, status:owned.status };
    try {
        const situation      = owned.existing.situation ?? '00x';
        const situationIndex = SITUATION_INDEX_MAP[situation] ?? 0;
        await prisma.facture.deleteMany({ where: { affaireId } });
        await prisma.affaire.delete({ where: { id: affaireId } });
        await updateNbrMontAffaire(abonneId, -1, situationIndex);
        await updateSuiviFacAbonne(abonneId, -1, 0, 0);
        return { ok: true };
    } catch (err) {
        console.error('[affaireActions/delete]', err);
        return { ok:false, error:'Erreur serveur lors de la suppression.', status:500 as const };
    }
}