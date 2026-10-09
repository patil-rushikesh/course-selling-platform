require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const logger = require('../utils/logger');

async function waitForDatabase() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    for (let attempt = 1; attempt <= 30; attempt++) {
        const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000 });
        try {
            await client.connect();
            await client.query('SELECT 1');
            logger.info('database.startup.ready');
            return;
        } catch (error) {
            if (attempt === 30) throw error;
            logger.warn('database.startup.waiting', logger.safeError(error));
        } finally {
            await client.end().catch(() => {});
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}
waitForDatabase().catch(error => {
    logger.fatal('database.startup.failed', logger.safeError(error));
    process.exitCode = 1;
});
