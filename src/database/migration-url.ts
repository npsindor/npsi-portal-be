export interface MigrationDatabase {
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
}

// Build directly from the API connection settings; never retain a placeholder host.
export const migrationDatabaseUrl = (db: MigrationDatabase): string => {
  if (!db.host || /[\s/@?#]/.test(db.host) || !Number.isInteger(db.port) || db.port < 1 || db.port > 65535) {
    throw new Error("Invalid migration database host or port.");
  }
  const host = db.host.includes(":") && !db.host.startsWith("[") ? `[${db.host}]` : db.host;
  return new URL(`mysql://${encodeURIComponent(db.user)}:${encodeURIComponent(db.password)}@${host}:${db.port}/${encodeURIComponent(db.name)}`).toString();
};
