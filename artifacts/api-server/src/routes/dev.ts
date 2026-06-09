import { Router } from "express";
import { supabase } from "../lib/supabase.js";

const devRouter = Router();

const TEST_USERS = [
  { email: "carlos_mty@kixx.dev", username: "carlos_mty", bio: "Gym todos los días. Monterrey es mi ciudad.", age: 28, city: "Monterrey", gender: "Hombre" },
  { email: "diegofit@kixx.dev", username: "diegofit", bio: "CrossFit y tacos. No en ese orden.", age: 25, city: "Ciudad de México", gender: "Hombre" },
  { email: "miguel_bcn@kixx.dev", username: "miguel_bcn", bio: "Entre el gym y la playa. Barcelona rules.", age: 31, city: "Barcelona", gender: "Hombre" },
  { email: "roberto_mad@kixx.dev", username: "roberto_mad", bio: "Calistenia y café. Buscando compañero de entreno.", age: 27, city: "Madrid", gender: "Hombre" },
  { email: "andres_bog@kixx.dev", username: "andres_bog", bio: "Fútbol, pesas y mucho flow bogotano.", age: 29, city: "Bogotá", gender: "Hombre" },
];

devRouter.post("/dev/seed-users", async (req, res) => {
  const results: { email: string; status: string; error?: string }[] = [];

  for (const u of TEST_USERS) {
    try {
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: u.email,
        password: "kixxme_test_2025",
        email_confirm: true,
      });

      if (authErr && !authErr.message.includes("already been registered")) {
        results.push({ email: u.email, status: "error", error: authErr.message });
        continue;
      }

      const userId = authData?.user?.id;
      if (!userId) {
        results.push({ email: u.email, status: "skipped (already exists)" });
        continue;
      }

      const { error: profileErr } = await supabase
        .from("profiles")
        .upsert({
          id: userId,
          username: u.username,
          bio: u.bio,
          age: u.age,
          city: u.city,
          gender: u.gender,
        }, { onConflict: "id" });

      if (profileErr) {
        results.push({ email: u.email, status: "auth ok, profile error", error: profileErr.message });
      } else {
        results.push({ email: u.email, status: "created" });
      }
    } catch (e: any) {
      results.push({ email: u.email, status: "exception", error: e?.message });
    }
  }

  res.json({ results });
});

export default devRouter;
