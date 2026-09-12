import { vi, type Mock } from "vitest";

/**
 * A deliberately shallow stand-in for the Supabase client.
 *
 * It answers exactly one question: **was a write issued?** Its query builder is
 * chainable and thenable, but it models no rows and honours no filters — a
 * `.eq()` is recorded and ignored. That is on purpose: a double that returned
 * rows per caller could pass while the real RLS policies were wrong, which is
 * the self-fulfilling fake `context/foundation/test-plan.md` §2 warns about.
 *
 * It does record the filter calls a query made (`filterLog`), so a test can
 * assert that a write was SCOPED — catching the dropped `.eq("id", id)` that
 * would turn one soft-delete into a mass delete. That is a structural check on
 * the query, not proof that the database would honour it.
 *
 * So: use it to prove that a rejected request persisted nothing, and that a
 * write named the row it meant to touch. Do NOT use it to claim anything about
 * authorization or row visibility — proving those needs the real database,
 * which is rollout phase 2's job.
 */

export interface QueryResult {
  data?: unknown;
  error?: { code?: string; message?: string; details?: string } | null;
}

type WriteOp = "insert" | "update" | "upsert" | "delete";

/** A recorded write. Indexed by a dynamic op key, so the signature is explicit. */
type WriteSpy = Mock<(table: string, payload: unknown) => void>;

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

/** A filter applied to a query, e.g. `.eq("id", "game-1")`. */
export interface FilterCall {
  table: string;
  method: "eq" | "is" | "lte" | "gte";
  column: unknown;
  value: unknown;
}

export interface SupabaseDoubleOptions {
  /** Result per table name; falls back to `fallback`. */
  results?: Record<string, QueryResult>;
  fallback?: QueryResult;
}

export interface SupabaseDouble {
  client: { from: (table: string) => QueryBuilder };
  /** Spies per write operation, for call-level assertions. */
  writes: Record<WriteOp, WriteSpy>;
  /** Every write issued, in order — the readable form of "nothing was persisted". */
  writeLog: WriteCall[];
  /** Every filter applied, in order — lets a test prove a write was scoped. */
  filterLog: FilterCall[];
  /** `[]` when no write was issued; otherwise `"table.op"` entries. */
  writeSummary: () => string[];
  /** `[]` when no filter was applied; otherwise `"method(column, value)"` entries. */
  filterSummary: () => string[];
}

export function createSupabaseDouble(options: SupabaseDoubleOptions = {}): SupabaseDouble {
  const writeLog: WriteCall[] = [];
  const filterLog: FilterCall[] = [];
  const writes: Record<WriteOp, WriteSpy> = {
    insert: vi.fn<(table: string, payload: unknown) => void>(),
    update: vi.fn<(table: string, payload: unknown) => void>(),
    upsert: vi.fn<(table: string, payload: unknown) => void>(),
    delete: vi.fn<(table: string, payload: unknown) => void>(),
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

    const filter = (method: FilterCall["method"]) => (column: unknown, value: unknown) => {
      filterLog.push({ table, method, column, value });
      return builder;
    };

    const builder: QueryBuilder = {
      select: passthrough,
      eq: filter("eq"),
      is: filter("is"),
      lte: filter("lte"),
      gte: filter("gte"),
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
    filterLog,
    writeSummary: () => writeLog.map((call) => `${call.table}.${call.op}`),
    filterSummary: () => filterLog.map((call) => `${call.method}(${String(call.column)}, ${String(call.value)})`),
  };
}
