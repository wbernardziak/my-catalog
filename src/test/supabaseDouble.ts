import { vi } from "vitest";

/**
 * A deliberately shallow stand-in for the Supabase client.
 *
 * It answers exactly one question: **was a write issued?** Its query builder is
 * chainable and thenable, but it models no rows and honours no filters — a
 * `.eq()` is recorded and ignored. That is on purpose: a double that returned
 * rows per caller could pass while the real RLS policies were wrong, which is
 * the self-fulfilling fake `context/foundation/test-plan.md` §2 warns about.
 *
 * So: use it to prove that a rejected request persisted nothing. Do NOT use it
 * to claim anything about authorization or row visibility — proving those needs
 * the real database, which is rollout phase 2's job.
 */

export interface QueryResult {
  data?: unknown;
  error?: { code?: string; message?: string; details?: string } | null;
}

type WriteOp = "insert" | "update" | "upsert" | "delete";

export interface QueryBuilder extends PromiseLike<{ data: unknown; error: QueryResult["error"] }> {
  select: (...args: unknown[]) => QueryBuilder;
  eq: (...args: unknown[]) => QueryBuilder;
  is: (...args: unknown[]) => QueryBuilder;
  lte: (...args: unknown[]) => QueryBuilder;
  gte: (...args: unknown[]) => QueryBuilder;
  order: (...args: unknown[]) => QueryBuilder;
  limit: (...args: unknown[]) => QueryBuilder;
  single: (...args: unknown[]) => QueryBuilder;
  maybeSingle: (...args: unknown[]) => QueryBuilder;
  insert: (...args: unknown[]) => QueryBuilder;
  update: (...args: unknown[]) => QueryBuilder;
  upsert: (...args: unknown[]) => QueryBuilder;
  delete: (...args: unknown[]) => QueryBuilder;
}

export interface WriteCall {
  table: string;
  op: WriteOp;
  payload: unknown;
}

export interface SupabaseDoubleOptions {
  /** Result per table name; falls back to `fallback`. */
  results?: Record<string, QueryResult>;
  fallback?: QueryResult;
}

export interface SupabaseDouble {
  client: { from: (table: string) => QueryBuilder };
  /** Spies per write operation, for call-level assertions. */
  writes: Record<WriteOp, ReturnType<typeof vi.fn>>;
  /** Every write issued, in order — the readable form of "nothing was persisted". */
  writeLog: WriteCall[];
  /** `[]` when no write was issued; otherwise `"table.op"` entries. */
  writeSummary: () => string[];
}

export function createSupabaseDouble(options: SupabaseDoubleOptions = {}): SupabaseDouble {
  const writeLog: WriteCall[] = [];
  const writes: Record<WriteOp, ReturnType<typeof vi.fn>> = {
    insert: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  };

  const resultFor = (table: string): { data: unknown; error: QueryResult["error"] } => {
    const configured = options.results?.[table] ?? options.fallback ?? {};
    return { data: configured.data ?? null, error: configured.error ?? null };
  };

  const createBuilder = (table: string): QueryBuilder => {
    const record = (op: WriteOp) => (payload: unknown) => {
      writeLog.push({ table, op, payload });
      writes[op](table, payload);
      return builder;
    };

    const passthrough = () => builder;

    const builder: QueryBuilder = {
      select: passthrough,
      eq: passthrough,
      is: passthrough,
      lte: passthrough,
      gte: passthrough,
      order: passthrough,
      limit: passthrough,
      single: passthrough,
      maybeSingle: passthrough,
      insert: record("insert"),
      update: record("update"),
      upsert: record("upsert"),
      delete: record("delete"),
      then: (onfulfilled, onrejected) => Promise.resolve(resultFor(table)).then(onfulfilled, onrejected),
    };

    return builder;
  };

  return {
    client: { from: (table: string) => createBuilder(table) },
    writes,
    writeLog,
    writeSummary: () => writeLog.map((call) => `${call.table}.${call.op}`),
  };
}
