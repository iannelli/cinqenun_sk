import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { dev } from '$app/environment';

type PrismaClientWithEvents = PrismaClient<{
    log: [
        { emit: 'event'; level: 'query' }, // On demande l'émission d'événements pour les requêtes SQL
        { emit: 'event'; level: 'error' } // On demande l'émission d'événements pour les erreurs Prisma
    ];
}>;
// Soit l'instance enrichie (en développement), soit l'instance standard (en production).
let prisma: PrismaClientWithEvents | PrismaClient;

if (dev) { // En mode développement, on crée un client Prisma avec la configuration de logs pour déclencher des événements au lieu d'écrire directement dans la console.
    // 1. Vider le fichier au démarrage
    fs.writeFileSync('prisma-debug.log', '');
    // 2. Ouvrir le flux en mode ajout (évite de ré-écraser en cours d'exécution)
    const logStream = fs.createWriteStream('prisma-debug.log', { flags: 'a' });
    // 3. Fermeture propre sur Ctrl+C
    const closeLogStream = () => {
        logStream.end();
    };
    process.on('SIGINT', () => {
        closeLogStream();
        process.exit(0);
    });
    process.on('SIGTERM', closeLogStream);
    // Création du client Prisma avec logs
    // En mode développement, on crée un client Prisma avec la configuration de logs pour déclencher des événements au lieu d'écrire directement dans la console
    const client = new PrismaClient({
        log: [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
        ],
    }) as PrismaClientWithEvents;
    // Abonnement à l'événement 'query'. Le paramètre 'e' est automatiquement typé grâce à PrismaClientWithEvents
    client.$on('query', (e) => {
        const time = new Date().toLocaleTimeString(); // Heure locale lisible
        const query = e.query.replace(/\s+/g, ' ').trim(); // Nettoyage de la requête SQL : suppression des espaces multiples et des retours à la ligne
        logStream.write(`[${time}] [QUERY] (${e.duration}ms) ${query}\n`); // Écriture d'une ligne compacte dans le fichier de log
    });
    // Abonnement à l'événement 'error'
    client.$on('error', (e) => { 
        const time = new Date().toISOString().split('T')[1].replace('Z', '');
        logStream.write(`\n[${time}] [ERROR] ❌ MESSAGE: ${e.message}\n`);
        logStream.write(`[${time}] [TARGET] ${e.target}\n\n`);
    });
    prisma = client; // Affectation du client configuré à la variable prisma
} else {
    // En production, on crée un client Prisma simple (sans logs). Les erreurs seront affichées normalement ou ignorées selon la configuration.
    prisma = new PrismaClient();
}

export { prisma }; // Export de l'instance unique (singleton) pour l'utiliser dans toute l'application.