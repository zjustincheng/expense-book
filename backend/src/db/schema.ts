import { resolveDatabaseConfig } from "./config.js";
import * as pgSchema from "./schema-pg.js";
import * as sqliteSchema from "./schema-sqlite.js";

const usePostgres = resolveDatabaseConfig(process.env).driver !== "sqlite";
const activeSchema = (usePostgres
  ? pgSchema
  : sqliteSchema) as unknown as typeof sqliteSchema;

export const {
  users,
  userSessions,
  groups,
  historicalReports,
  access,
  userPreferences,
  members,
  projects,
  categories,
  splitTemplates,
  recurringTransactions,
  importBatches,
  notificationDismissals,
  entries,
  attachments,
  effects,
  drafts,
  draftRevisions,
  previews,
  financialRequests,
  draftRequests,
  invitations,
  managementEvents,
  managementRequests,
} = activeSchema;
