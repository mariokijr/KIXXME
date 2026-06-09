
  import { createClient } from "@supabase/supabase-js";
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: au } = await sb.auth.admin.listUsers({ page:1, perPage:200 });
  const seeded = (au?.users ?? []).filter(u => u.email?.endsWith('@kixx.dev'));
  const ids = seeded.map(u => u.id);
  console.log('Seeded to remove:', ids.length, seeded.map(u=>u.email).join(', '));
  if (ids.length === 0) { console.log('Nothing to clean'); process.exit(0); }

  // conversations involving seeded
  const { data: convs } = await sb.from('conversations').select('id,user1_id,user2_id');
  const seededConvIds = (convs ?? []).filter(c => ids.includes(c.user1_id) || ids.includes(c.user2_id)).map(c => c.id);

  if (seededConvIds.length) {
    const { error: me } = await sb.from('messages').delete().in('conversation_id', seededConvIds);
    console.log('deleted messages in seeded convs:', me?.message ?? 'ok');
  }
  { const { error } = await sb.from('messages').delete().in('sender_id', ids); console.log('deleted messages by seeded senders:', error?.message ?? 'ok'); }
  if (seededConvIds.length) { const { error } = await sb.from('conversations').delete().in('id', seededConvIds); console.log('deleted seeded convs:', error?.message ?? 'ok'); }
  { const { error } = await sb.from('likes').delete().or('liker_id.in.(' + ids.join(',') + '),liked_id.in.(' + ids.join(',') + ')'); console.log('deleted likes:', error?.message ?? 'ok'); }
  { const { error } = await sb.from('reports').delete().or('reporter_id.in.(' + ids.join(',') + '),reported_user_id.in.(' + ids.join(',') + ')'); console.log('deleted reports:', error?.message ?? 'ok'); }

  // storage + photo rows
  const { data: photos } = await sb.from('profile_photos').select('id,user_id,storage_path').in('user_id', ids);
  const paths = (photos ?? []).map(p => p.storage_path).filter(Boolean);
  if (paths.length) { const { error } = await sb.storage.from('avatars').remove(paths); console.log('removed storage objects:', paths.length, error?.message ?? 'ok'); }
  { const { error } = await sb.from('profile_photos').delete().in('user_id', ids); console.log('deleted photo rows:', error?.message ?? 'ok'); }
  { const { error } = await sb.from('profiles').delete().in('id', ids); console.log('deleted profiles:', error?.message ?? 'ok'); }

  for (const id of ids) { const { error } = await sb.auth.admin.deleteUser(id); console.log('deleted auth user', id, error?.message ?? 'ok'); }

  const { data: au2 } = await sb.auth.admin.listUsers({ page:1, perPage:200 });
  console.log('Remaining auth users:', au2?.users?.length, JSON.stringify((au2?.users??[]).map(u=>u.email)));
  