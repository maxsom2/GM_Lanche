/* Consultas compatíveis com as tabelas do SQL já executado no Supabase. */
(() => {
  const sb = () => window.gmSupabaseReady && window.gmSupabase;

  async function getMenu() {
    const client = sb();
    if (!client) return { data: null, error: new Error('Supabase não configurado.') };

    const [productsResult, linksResult, ingredientsResult] = await Promise.all([
      client.from('products')
        .select('id,slug,name,description,price,image_url,product_category,is_available,is_listed,display_order')
        .eq('is_listed', true)
        .order('display_order', { ascending: true }),
      client.from('product_ingredients')
        .select('product_id,ingredient_id,quantity,display_order')
        .order('display_order', { ascending: true }),
      client.from('ingredients')
        .select('id,name,is_active')
        .eq('is_active', true)
    ]);

    const error = productsResult.error || linksResult.error || ingredientsResult.error;
    if (error) return { data: null, error };

    const ingredientById = new Map((ingredientsResult.data || []).map(item => [item.id, item]));
    const linksByProduct = new Map();
    for (const link of linksResult.data || []) {
      const ingredient = ingredientById.get(link.ingredient_id);
      if (!ingredient) continue;
      if (!linksByProduct.has(link.product_id)) linksByProduct.set(link.product_id, []);
      linksByProduct.get(link.product_id).push({
        id: ingredient.id,
        name: ingredient.name,
        quantity: link.quantity,
        display_order: link.display_order
      });
    }

    const data = (productsResult.data || []).map(product => ({
      ...product,
      ingredients: (linksByProduct.get(product.id) || [])
        .sort((a, b) => Number(a.display_order) - Number(b.display_order))
    }));
    return { data, error: null };
  }

  async function getNeighborhoods({ activeOnly = true } = {}) {
    const client = sb();
    if (!client) return { data: null, error: new Error('Supabase não configurado.') };
    let query = client.from('neighborhoods')
      .select('id,name,delivery_fee,is_active')
      .order('name', { ascending: true });
    if (activeOnly) query = query.eq('is_active', true);
    return await query;
  }

  async function isStoreOpen() {
    const client = sb();
    if (!client) return { data: null, error: new Error('Supabase não configurado.') };
    return await client.rpc('is_store_open', { p_at: new Date().toISOString() });
  }

  window.GMData = { getMenu, getNeighborhoods, isStoreOpen };
})();
