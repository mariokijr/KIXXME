
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(url + "/rest/v1/", { headers: { apikey: key, Authorization: "Bearer " + key } });
  const spec = await res.json();
  const defs = spec.definitions || {};
  for (const t of ['profile_photos','conversations','messages','likes','reports']) {
    const props = defs[t]?.properties ? Object.keys(defs[t].properties) : 'MISSING';
    console.log(t, '->', JSON.stringify(props));
  }
  