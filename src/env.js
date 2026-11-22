// Charge le fichier .env s'il existe (fonction native de Node.js)
import fs from 'node:fs';
if (fs.existsSync('.env')) process.loadEnvFile('.env');
