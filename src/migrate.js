import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('analytics.db');
const migration = fs.readFileSync('migrate-schema.sql', 'utf8');

db.exec('PRAGMA foreign_keys = ON;');
db.exec(migration);

console.log('Database migrated successfully.');
