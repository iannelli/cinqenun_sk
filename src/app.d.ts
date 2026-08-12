// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
        interface Locals {
            user?: {
                id: number;
                email: string;
            };
            session?: {
                id: number;
                userId: number;
                email: string;
                expiresAt: Date;
            };
            statutAffaireActiveDone?: boolean;
        }
	}
}

export {};