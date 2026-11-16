(() => {
  const cfg = window.GM_CONFIG || {};
  const valid = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !String(cfg.SUPABASE_URL).startsWith('COLE_') &&
    !String(cfg.SUPABASE_ANON_KEY).startsWith('COLE_');
  window.gmSupabaseReady = Boolean(valid && window.supabase?.createClient);
  window.gmSupabase = window.gmSupabaseReady
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;
})();
