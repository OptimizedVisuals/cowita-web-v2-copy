/**
 * In-memory stand-in for the Supabase client used by the API tests.
 *
 * Implements just enough of the query builder surface for the endpoints:
 *   from(table).select(...).eq/.is/.gte/.lte/.or().order().range().maybeSingle()
 *   from(table).insert(...)
 *   from(table).update(...).eq()
 *   from(table).delete().eq()
 *   rpc('bump_rate_limit' | 'purge_expired_submissions')
 *   auth.getUser(token)
 */

export function makeJwt({ sub = 'user-1', aal = 'aal2', email = 'admin@cowita.org' } = {}) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  return [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({ sub, aal, email, exp: Math.floor(Date.now() / 1000) + 3600 }),
    'test-signature',
  ].join('.');
}

function matches(row, filters) {
  return filters.every(({ op, column, value }) => {
    const cell = row[column];

    switch (op) {
      case 'eq':
        return cell === value;
      case 'is':
        return value === null ? cell === null || cell === undefined : cell === value;
      case 'gte':
        return cell >= value;
      case 'lte':
        return cell <= value;
      case 'lt':
        return cell < value;
      case 'ilike': {
        const needle = String(value).replace(/%/g, '').toLowerCase();
        return String(cell || '').toLowerCase().includes(needle);
      }
      case 'or': {
        return value.some((term) => {
          const [column, , raw] = term.split('.');
          const needle = String(raw || '').replace(/%/g, '').toLowerCase();
          return String(row[column] || '').toLowerCase().includes(needle);
        });
      }
      default:
        return true;
    }
  });
}

export function createFakeSupabase(options = {}) {
  const state = {
    submissions: options.submissions ? [...options.submissions] : [],
    submission_events: [],
    admin_users: options.adminUsers ? [...options.adminUsers] : [],
    rate_limits: [],
    rpcCount: options.rpcCount ?? 1,
    usersByToken: options.usersByToken || {},
    authCalls: [],
  };

  function table(name) {
    const ctx = {
      name,
      filters: [],
      order: null,
      range: null,
      mode: 'select',
      payload: null,
      _single: false,
      _maybeSingle: false,
    };

    const api = {
      // select() narrows the returned columns in real PostgREST; here it must
      // NOT reset the mode, so insert/update/delete chains keep working.
      select() {
        return api;
      },
      insert(rows) {
        ctx.mode = 'insert';
        ctx.payload = Array.isArray(rows) ? rows : [rows];
        return api;
      },
      update(values) {
        ctx.mode = 'update';
        ctx.payload = values;
        return api;
      },
      delete() {
        ctx.mode = 'delete';
        return api;
      },
      eq(column, value) {
        ctx.filters.push({ op: 'eq', column, value });
        return api;
      },
      is(column, value) {
        ctx.filters.push({ op: 'is', column, value });
        return api;
      },
      gte(column, value) {
        ctx.filters.push({ op: 'gte', column, value });
        return api;
      },
      lte(column, value) {
        ctx.filters.push({ op: 'lte', column, value });
        return api;
      },
      lt(column, value) {
        ctx.filters.push({ op: 'lt', column, value });
        return api;
      },
      ilike(column, value) {
        ctx.filters.push({ op: 'ilike', column, value });
        return api;
      },
      or(expression) {
        // Supports the "a.ilike.%x%,b.ilike.%x%" form we emit.
        const terms = String(expression)
          .split(',')
          .map((part) => part.trim());
        ctx.filters.push({ op: 'or', column: 'any', value: terms });
        return api;
      },
      order(column, { ascending = true } = {}) {
        ctx.order = { column, ascending };
        return api;
      },
      range(from, to) {
        ctx.range = { from, to };
        return api;
      },
      limit(value) {
        ctx.range = { from: 0, to: value - 1 };
        return api;
      },
      maybeSingle() {
        ctx._maybeSingle = true;
        return api;
      },
      single() {
        ctx._single = true;
        return api;
      },
      then(resolve, reject) {
        return Promise.resolve()
          .then(() => execute(ctx))
          .then(resolve, reject);
      },
    };

    return api;
  }

  function execute(ctx) {
    const rows = state[ctx.name] || (state[ctx.name] = []);

    if (ctx.mode === 'insert') {
      const inserted = ctx.payload.map((row, index) => ({
        id: row.id || `${ctx.name}-${rows.length + index + 1}`,
        created_at: row.created_at || new Date().toISOString(),
        ...row,
      }));
      rows.push(...inserted);

      if (ctx._single || ctx._maybeSingle) {
        return { data: inserted[0] || null, error: null };
      }

      return { data: inserted, error: null };
    }

    const filtered = rows.filter((row) => matches(row, ctx.filters));

    if (ctx.mode === 'update') {
      for (const row of filtered) Object.assign(row, ctx.payload);
      if (ctx._single || ctx._maybeSingle) {
        return { data: filtered[0] || null, error: null };
      }
      return { data: filtered, error: null };
    }

    if (ctx.mode === 'delete') {
      state[ctx.name] = rows.filter((row) => !filtered.includes(row));
      return { data: null, error: null, count: filtered.length };
    }

    let result = [...filtered];

    if (ctx.order) {
      const { column, ascending } = ctx.order;
      result.sort((a, b) => {
        if (a[column] === b[column]) return 0;
        return (a[column] > b[column] ? 1 : -1) * (ascending ? 1 : -1);
      });
    }

    if (ctx.range) {
      result = result.slice(ctx.range.from, ctx.range.to + 1);
    }

    if (ctx._single || ctx._maybeSingle) {
      return { data: result[0] || null, error: null };
    }

    return { data: result, error: null, count: filtered.length };
  }

  const client = {
    from: (name) => table(name),

    async rpc(name) {
      if (name === 'bump_rate_limit') {
        return { data: state.rpcCount, error: null };
      }
      if (name === 'purge_expired_submissions') {
        return { data: state.purgedCount || 0, error: null };
      }
      return { data: null, error: null };
    },

    auth: {
      async getUser(token) {
        state.authCalls.push(token);
        const user = state.usersByToken[token];
        if (!user) return { data: { user: null }, error: { message: 'invalid token' } };
        return { data: { user }, error: null };
      },
    },

    __state: state,
    __setRpcCount(value) {
      state.rpcCount = value;
    },
  };

  return client;
}
