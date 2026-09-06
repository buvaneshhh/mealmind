"use client";

import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { supabase } from "@/lib/supabase";

export default function AppHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white/70 px-4 py-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-black/40">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
      </div>
      <motion.button
        whileHover={reduceMotion ? undefined : { scale: 1.03 }}
        whileTap={reduceMotion ? undefined : { scale: 0.97 }}
        onClick={handleLogout}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm transition-shadow duration-200 hover:bg-zinc-100 hover:shadow-sm dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        Log out
      </motion.button>
    </header>
  );
}
