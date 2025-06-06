// pages/api/history.js
import { supabase } from '@/lib/supabaseClient';

export default async function handler(req, res) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) {
    res.status(500).json({ error: 'Fetch failed' });
  } else {
    res.status(200).json(data);
  }
}
