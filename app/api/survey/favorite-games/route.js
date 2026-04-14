import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

/** Public list of active games for the survey — display names only (informational). */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('favorite_games')
      .select('name')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      if (error.code === '42P01' || /favorite_games/.test(error.message ?? '')) {
        return NextResponse.json(
          { games: [], error: 'Game list is not available yet. Run the database migration for favorite_games.' },
          { status: 503 }
        );
      }
      console.error('[survey/favorite-games]', error.message ?? error);
      return NextResponse.json({ error: 'Could not load games.' }, { status: 500 });
    }

    const games = (data ?? []).map((row) => ({ name: row.name }));
    return NextResponse.json({ games }, { status: 200 });
  } catch (e) {
    console.error('[survey/favorite-games]', e?.message ?? e);
    return NextResponse.json({ error: 'Could not load games.' }, { status: 500 });
  }
}
