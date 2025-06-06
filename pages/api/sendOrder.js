// pages/api/sendOrder.js
import { supabase } from '@/lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const order = req.body;

  const { error } = await supabase.from('orders').insert(order);

  if (error) {
    res.status(500).json({ error: 'Insert failed' });
  } else {
    res.status(200).json({ success: true });
  }
}
